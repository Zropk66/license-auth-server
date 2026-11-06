import { getQuickJS, Scope } from 'quickjs-emscripten';

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

let quickJSPromise: ReturnType<typeof getQuickJS> | null = null;
function getQuickJSInstance() {
  if (!quickJSPromise) {
    quickJSPromise = getQuickJS();
  }
  return quickJSPromise;
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

  const QuickJS = await getQuickJSInstance();

  return Scope.withScope((scope) => {
    const rt = scope.manage(QuickJS.newRuntime());
    // Hard memory limit: 8MB to prevent heap exhaustion
    rt.setMemoryLimit(1024 * 1024 * 8);

    let interrupted = false;
    const deadline = Date.now() + timeoutMs;
    rt.setInterruptHandler(() => {
      if (Date.now() > deadline) {
        interrupted = true;
        return true;
      }
      return false;
    });

    const vm = scope.manage(rt.newContext());

    let isRejected = false;
    let rejectionMessage = '';

    // reject() callback
    const rejectFn = scope.manage(
      vm.newFunction('reject', (reasonHandle) => {
        isRejected = true;
        if (reasonHandle) {
          const dumped = vm.dump(reasonHandle);
          if (typeof dumped === 'string') {
            rejectionMessage = dumped;
          } else if (dumped && typeof dumped === 'object') {
            if ('message' in dumped) {
              rejectionMessage = String((dumped as { message: unknown }).message);
            } else {
              rejectionMessage = JSON.stringify(dumped);
            }
          } else {
            rejectionMessage = String(dumped);
          }
        } else {
          rejectionMessage = 'Rejected by hook script';
        }
      })
    );
    vm.setProp(vm.global, 'reject', rejectFn);

    // console logger
    const consoleObj = scope.manage(vm.newObject());
    const logFn = scope.manage(
      vm.newFunction('log', (...args) => {
        console.log(`[HookScript:${req.softwareName}]`, ...args.map((a) => vm.dump(a)));
      })
    );
    const warnFn = scope.manage(
      vm.newFunction('warn', (...args) => {
        console.warn(`[HookScript:${req.softwareName}]`, ...args.map((a) => vm.dump(a)));
      })
    );
    const errorFn = scope.manage(
      vm.newFunction('error', (...args) => {
        console.error(`[HookScript:${req.softwareName}]`, ...args.map((a) => vm.dump(a)));
      })
    );
    vm.setProp(consoleObj, 'log', logFn);
    vm.setProp(consoleObj, 'warn', warnFn);
    vm.setProp(consoleObj, 'error', errorFn);
    vm.setProp(vm.global, 'console', consoleObj);

    // Provide req and payload
    const setupCode = `var req = Object.freeze(${JSON.stringify(req)}); var payload = ${JSON.stringify(payloadObj)};`;
    const setupRes = vm.evalCode(setupCode);
    if ('value' in setupRes && setupRes.value) setupRes.value.dispose();
    if ('error' in setupRes && setupRes.error) setupRes.error.dispose();

    // Execute user hook script
    const evalRes = vm.evalCode(script);

    // Drain any microtasks / promises
    if (rt.hasPendingJob()) {
      const jobsRes = rt.executePendingJobs();
      if ('error' in jobsRes && jobsRes.error) jobsRes.error.dispose();
    }

    if (interrupted) {
      console.error(`[HookScript:${req.softwareName}] execution failed: Script execution timed out`);
      if ('value' in evalRes && evalRes.value) evalRes.value.dispose();
      if ('error' in evalRes && evalRes.error) evalRes.error.dispose();
      return {
        success: false,
        rejected: false,
        finalPayloadString: payloadString ?? null,
        error: 'Script execution timed out',
      };
    }

    if ('error' in evalRes && evalRes.error) {
      const errDump = vm.dump(evalRes.error);
      evalRes.error.dispose();

      const errorMsg =
        typeof errDump === 'string'
          ? errDump
          : errDump && typeof errDump === 'object' && 'message' in errDump
            ? String((errDump as { message: unknown }).message)
            : JSON.stringify(errDump);
      const errorName =
        errDump && typeof errDump === 'object' && 'name' in errDump
          ? String((errDump as { name: unknown }).name)
          : '';

      // Gracefully degrade on syntax errors, memory limits, and timeouts
      if (
        errorMsg.includes('interrupted') ||
        errorMsg.includes('out of memory') ||
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

      // Explicit throw signals intentional rejection
      return {
        success: false,
        rejected: true,
        rejectReason: errorMsg || 'Rejected by hook script exception',
        finalPayloadString: payloadString ?? null,
        error: errorMsg,
      };
    }

    if ('value' in evalRes && evalRes.value) {
      evalRes.value.dispose();
    }

    if (isRejected) {
      return {
        success: false,
        rejected: true,
        rejectReason: rejectionMessage || 'Rejected by hook script',
        finalPayloadString: payloadString ?? null,
      };
    }

    // Extract serialized payload
    const dumpRes = vm.evalCode('try { JSON.stringify(payload); } catch(e) { null; }');
    let resultString: string | null = null;
    if ('value' in dumpRes && dumpRes.value) {
      const dumped = vm.dump(dumpRes.value);
      dumpRes.value.dispose();
      if (typeof dumped === 'string') {
        resultString = dumped;
      }
    } else if ('error' in dumpRes && dumpRes.error) {
      dumpRes.error.dispose();
    }

    return {
      success: true,
      rejected: false,
      finalPayloadString: resultString,
    };
  });
}
