import vm from 'node:vm';

export interface HookRequestContext {
  protocol: 'verify' | 'veil';
  softwareName: string;
  licenseKey?: string | null;
  hwid?: string | null;
  deviceName?: string | null;
  nonce?: string | null;
  timestamp?: number | null;
  version?: string | null;
  versionCode?: number | null;
  ipAddress?: string | null;
  [key: string]: unknown;
}

export interface HookRunnerOptions {
  script: string | null | undefined;
  req: HookRequestContext;
  payloadString: string | null | undefined;
  timeoutMs?: number;
}

export interface HookRunnerResult {
  success: boolean;
  rejected: boolean;
  rejectReason?: string;
  finalPayloadString: string | null;
  error?: string;
}

export async function executeHookScript(
  options: HookRunnerOptions
): Promise<HookRunnerResult> {
  const { script, req, payloadString, timeoutMs = 50 } = options;

  if (!script || typeof script !== 'string' || !script.trim()) {
    return {
      success: true,
      rejected: false,
      finalPayloadString: payloadString ?? null,
    };
  }

  let payloadObj: Record<string, unknown> = {};
  if (payloadString) {
    try {
      const parsed = JSON.parse(payloadString);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payloadObj = parsed as Record<string, unknown>;
      } else {
        payloadObj = { value: parsed };
      }
    } catch {
      payloadObj = { raw: payloadString };
    }
  }

  let isRejected = false;
  let rejectionMessage = '';

  const sandbox = {
    req: Object.freeze({ ...req }),
    payload: payloadObj,
    BigInt,
    reject: (reason?: string) => {
      isRejected = true;
      rejectionMessage = reason || 'Rejected by hook script';
    },
    console: {
      log: (...args: unknown[]) => console.log(`[HookScript:${req.softwareName}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[HookScript:${req.softwareName}]`, ...args),
      error: (...args: unknown[]) => console.error(`[HookScript:${req.softwareName}]`, ...args),
    },
  };

  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(script, context, { timeout: timeoutMs });

    if (isRejected) {
      return {
        success: false,
        rejected: true,
        rejectReason: rejectionMessage,
        finalPayloadString: payloadString ?? null,
      };
    }

    let resultString: string | null = null;
    if (sandbox.payload && typeof sandbox.payload === 'object') {
      resultString = JSON.stringify(sandbox.payload);
    }

    return {
      success: true,
      rejected: false,
      finalPayloadString: resultString,
    };
  } catch (err: unknown) {
    const errorMsg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
    const errorName =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';

    // Timeout and Syntax errors degrade gracefully without blocking
    if (
      errorMsg.includes('Script execution timed out') ||
      errorName === 'SyntaxError' ||
      errorMsg.includes('SyntaxError')
    ) {
      console.error(`[HookScript:${req.softwareName}] execution failed:`, errorMsg);
      return {
        success: false,
        rejected: false,
        finalPayloadString: payloadString ?? null,
        error: errorMsg,
      };
    }

    // Explicit thrown exceptions in scripts signal intentional verification rejection
    return {
      success: false,
      rejected: true,
      rejectReason: errorMsg || 'Rejected by hook script exception',
      finalPayloadString: payloadString ?? null,
      error: errorMsg,
    };
  }
}
