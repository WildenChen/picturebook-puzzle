/*
 * Dependency-free JSON Schema (2020-12 subset) validator.
 *
 * Supports exactly the keywords used by schemas/book.schema.json:
 * $ref (local pointers only), type, const, enum, required, properties,
 * additionalProperties, items, minItems, maxItems, uniqueItems, minLength,
 * maxLength, pattern, minimum, maximum, exclusiveMinimum, exclusiveMaximum,
 * minProperties, allOf, anyOf, oneOf, not.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BookSchema = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function resolveRef(ref, rootSchema) {
    if (typeof ref !== "string" || ref[0] !== "#") return null;
    const pointer = ref.slice(1);
    if (pointer === "") return rootSchema;
    if (pointer.indexOf("/") !== 0) return null;
    let node = rootSchema;
    for (const rawSegment of pointer.slice(1).split("/")) {
      const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
      if (node === null || typeof node !== "object") return null;
      node = node[segment];
    }
    return node === undefined ? null : node;
  }

  function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (Number.isInteger(value)) return "integer";
    return typeof value;
  }

  function typeMatches(value, expected) {
    const actual = typeOf(value);
    if (expected === "number") return actual === "number" || actual === "integer";
    if (expected === "integer") return actual === "integer";
    return actual === expected;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeOf(a) !== typeOf(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }
    if (a && typeof a === "object") {
      const aKeys = Object.keys(a).sort();
      const bKeys = Object.keys(b).sort();
      if (aKeys.length !== bKeys.length) return false;
      if (!aKeys.every((key, index) => key === bKeys[index])) return false;
      return aKeys.every((key) => deepEqual(a[key], b[key]));
    }
    return false;
  }

  function checkType(value, expected, path, errors) {
    const list = Array.isArray(expected) ? expected : [expected];
    if (!list.some((item) => typeMatches(value, item))) {
      errors.push({
        path: path,
        message: "型別不符，預期 " + list.join(" 或 ") + "，實際 " + typeOf(value)
      });
      return false;
    }
    return true;
  }

  function validateNode(value, schema, rootSchema, path, errors) {
    if (schema === true || schema === undefined) return;
    if (schema === false) {
      errors.push({ path: path, message: "此位置不被允許" });
      return;
    }
    if (schema.$ref) {
      const resolved = resolveRef(schema.$ref, rootSchema);
      if (!resolved) {
        errors.push({ path: path, message: "無法解析 $ref: " + schema.$ref });
        return;
      }
      validateNode(value, resolved, rootSchema, path, errors);
      return;
    }

    if (schema.type !== undefined && !checkType(value, schema.type, path, errors)) return;

    if (schema.const !== undefined && !deepEqual(value, schema.const)) {
      errors.push({
        path: path,
        message: "必須為固定值 " + JSON.stringify(schema.const)
      });
    }

    if (schema.enum !== undefined && !schema.enum.some((item) => deepEqual(value, item))) {
      errors.push({
        path: path,
        message: "必須為以下之一：" + schema.enum.map((v) => JSON.stringify(v)).join("、")
      });
    }

    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ path: path, message: "字串長度至少需 " + schema.minLength });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({ path: path, message: "字串長度不得超過 " + schema.maxLength });
      }
      if (schema.pattern !== undefined) {
        let re = null;
        try {
          re = new RegExp(schema.pattern);
        } catch (error) {
          errors.push({ path: path, message: "pattern 無法編譯: " + schema.pattern });
        }
        if (re && !re.test(value)) {
          errors.push({ path: path, message: "不符合格式規則 " + schema.pattern });
        }
      }
    }

    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({ path: path, message: "不得小於 " + schema.minimum });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({ path: path, message: "不得大於 " + schema.maximum });
      }
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
        errors.push({ path: path, message: "必須大於 " + schema.exclusiveMinimum });
      }
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
        errors.push({ path: path, message: "必須小於 " + schema.exclusiveMaximum });
      }
    }

    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({ path: path, message: "至少需 " + schema.minItems + " 個項目" });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({ path: path, message: "至多可有 " + schema.maxItems + " 個項目" });
      }
      if (schema.uniqueItems === true) {
        for (let i = 0; i < value.length; i++) {
          for (let j = i + 1; j < value.length; j++) {
            if (deepEqual(value[i], value[j])) {
              errors.push({ path: path + "/" + i, message: "項目內容重複" });
            }
          }
        }
      }
      if (schema.items) {
        value.forEach((item, index) => {
          validateNode(item, schema.items, rootSchema, path + "/" + index, errors);
        });
      }
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
        errors.push({ path: path, message: "至少需 " + schema.minProperties + " 個欄位" });
      }
      if (schema.required) {
        for (const key of schema.required) {
          if (!Object.prototype.hasOwnProperty.call(value, key)) {
            errors.push({ path: path + "/" + key, message: "缺少必填欄位" });
          }
        }
      }
      if (schema.properties) {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(schema.properties, key)) {
            validateNode(
              value[key],
              schema.properties[key],
              rootSchema,
              path + "/" + key,
              errors
            );
          }
        }
      }
      if (schema.additionalProperties !== undefined) {
        const known = schema.properties ? Object.keys(schema.properties) : [];
        for (const key of keys) {
          if (known.indexOf(key) !== -1) continue;
          if (schema.additionalProperties === false) {
            errors.push({
              path: path + "/" + key,
              message: "不允許的額外欄位 " + key
            });
          } else {
            validateNode(
              value[key],
              schema.additionalProperties,
              rootSchema,
              path + "/" + key,
              errors
            );
          }
        }
      }
    }

    if (schema.allOf) {
      schema.allOf.forEach((sub) => validateNode(value, sub, rootSchema, path, errors));
    }
    if (schema.anyOf) {
      const matched = schema.anyOf.some((sub) => {
        const local = [];
        validateNode(value, sub, rootSchema, path, local);
        return local.length === 0;
      });
      if (!matched) errors.push({ path: path, message: "不符合 anyOf 條件" });
    }
    if (schema.oneOf) {
      let matchCount = 0;
      schema.oneOf.forEach((sub) => {
        const local = [];
        validateNode(value, sub, rootSchema, path, local);
        if (local.length === 0) matchCount++;
      });
      if (matchCount !== 1) {
        errors.push({
          path: path,
          message: "oneOf 需恰有一個相符子句，目前相符 " + matchCount + " 個"
        });
      }
    }
    if (schema.not) {
      const local = [];
      validateNode(value, schema.not, rootSchema, path, local);
      if (local.length === 0) errors.push({ path: path, message: "不符合 not 條件" });
    }
  }

  function validate(instance, schema) {
    const errors = [];
    validateNode(instance, schema, schema, "", errors);
    return errors;
  }

  return { validate: validate };
});
