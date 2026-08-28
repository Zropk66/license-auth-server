#pragma once

// 最小 JSON 字段提取器：仅用于本客户端可控的固定结构响应
// GetRawObject 返回的必须是原始字节子串——Ed25519 签名验证依赖签名时的原文

#include <cstdlib>
#include <string>

namespace json_mini {

namespace detail {

// 找到 "key" 位置后指向的 ':' 之后，跳过空白；失败返回 npos
inline size_t AfterColon(const std::string& json, const std::string& key) {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  while (pos != std::string::npos) {
    size_t colon = json.find(':', pos + needle.size());
    if (colon == std::string::npos) return std::string::npos;
    size_t i = colon + 1;
    while (i < json.size() && (json[i] == ' ' || json[i] == '\t' || json[i] == '\r' || json[i] == '\n')) ++i;
    // 确认冒号紧跟 key（中间没有其他 token）
    size_t between = json.find_first_not_of(" \t\r\n", pos + needle.size());
    if (between == colon) return i;
    pos = json.find(needle, pos + 1);
  }
  return std::string::npos;
}

inline void AppendUtf8(std::string& out, uint32_t cp) {
  if (cp <= 0x7F) {
    out.push_back(static_cast<char>(cp));
  } else if (cp <= 0x7FF) {
    out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
    out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
  } else if (cp <= 0xFFFF) {
    out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
    out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
  } else {
    out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
    out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
  }
}

inline int HexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

}  // namespace detail

// "key":"value" → 反转义后的 value
inline bool GetString(const std::string& json, const std::string& key, std::string& out) {
  size_t i = detail::AfterColon(json, key);
  if (i == std::string::npos || i >= json.size() || json[i] != '"') return false;
  ++i;
  out.clear();
  while (i < json.size()) {
    char c = json[i];
    if (c == '"') return true;
    if (c == '\\') {
      if (i + 1 >= json.size()) return false;
      char e = json[i + 1];
      i += 2;
      switch (e) {
        case '"': out.push_back('"'); break;
        case '\\': out.push_back('\\'); break;
        case '/': out.push_back('/'); break;
        case 'b': out.push_back('\b'); break;
        case 'f': out.push_back('\f'); break;
        case 'n': out.push_back('\n'); break;
        case 'r': out.push_back('\r'); break;
        case 't': out.push_back('\t'); break;
        case 'u': {
          if (i + 4 > json.size()) return false;
          uint32_t cp = 0;
          for (int k = 0; k < 4; ++k) {
            int v = detail::HexVal(json[i + k]);
            if (v < 0) return false;
            cp = (cp << 4) | static_cast<uint32_t>(v);
          }
          i += 4;
          // 代理对
          if (cp >= 0xD800 && cp <= 0xDBFF && i + 6 <= json.size() &&
              json[i] == '\\' && json[i + 1] == 'u') {
            uint32_t lo = 0;
            bool valid = true;
            for (int k = 0; k < 4; ++k) {
              int v = detail::HexVal(json[i + 2 + k]);
              if (v < 0) { valid = false; break; }
              lo = (lo << 4) | static_cast<uint32_t>(v);
            }
            if (valid && lo >= 0xDC00 && lo <= 0xDFFF) {
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
              i += 6;
            }
          }
          detail::AppendUtf8(out, cp);
          break;
        }
        default: return false;
      }
    } else {
      out.push_back(c);
      ++i;
    }
  }
  return false;
}

// "key":{...} → 原始对象子串（含首尾花括号，字节级精确）
inline bool GetRawObject(const std::string& json, const std::string& key, std::string& out) {
  size_t i = detail::AfterColon(json, key);
  if (i == std::string::npos || i >= json.size() || json[i] != '{') return false;

  size_t start = i;
  int depth = 0;
  bool inStr = false, esc = false;
  for (; i < json.size(); ++i) {
    char c = json[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c == '\\') esc = true;
      else if (c == '"') inStr = false;
    } else {
      if (c == '"') inStr = true;
      else if (c == '{') ++depth;
      else if (c == '}') {
        --depth;
        if (depth == 0) {
          out = json.substr(start, i - start + 1);
          return true;
        }
      }
    }
  }
  return false;
}

// "key":true/false → 布尔
inline bool GetBool(const std::string& json, const std::string& key, bool& out) {
  size_t i = detail::AfterColon(json, key);
  if (i == std::string::npos) return false;
  if (json.compare(i, 4, "true") == 0) { out = true; return true; }
  if (json.compare(i, 5, "false") == 0) { out = false; return true; }
  return false;
}

// "key":number → 数值
inline bool GetNumber(const std::string& json, const std::string& key, double& out) {
  size_t i = detail::AfterColon(json, key);
  if (i == std::string::npos) return false;
  size_t start = i;
  while (i < json.size() && (json[i] == '-' || json[i] == '+' || json[i] == '.' || json[i] == 'e' ||
                             json[i] == 'E' || (json[i] >= '0' && json[i] <= '9'))) {
    ++i;
  }
  if (i == start) return false;
  out = std::strtod(json.substr(start, i - start).c_str(), nullptr);
  return true;
}

// 构造请求 JSON 用的字符串转义
inline std::string Escape(const std::string& s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out.push_back(c);
        }
    }
  }
  return out;
}

}  // namespace json_mini
