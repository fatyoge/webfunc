# Skill JSON 格式参考

## 完整示例

```json
{
  "name": "skill-name",
  "version": "1.0.0",
  "description": "Skill 描述（MCP 中作为 tool 说明）",
  "target_origin": "https://example.com",
  "execution_mode": "browser",
  "parameters": {
    "param1": {
      "type": "string",
      "required": true,
      "default": "default-value",
      "description": "参数说明"
    }
  },
  "steps": [
    {
      "id": "step1",
      "method": "GET",
      "url": "https://example.com/api/data",
      "headers": {},
      "body": "key={{param1}}",
      "extract": { "data": "$.path.to.value" },
      "assert": { "status": 200 }
    }
  ],
  "output": {
    "summary": "获取到 {{data.length}} 条数据",
    "extract": { "data": "$.path" }
  },
  "post_process": "generateMarkdown"
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Skill 唯一标识 |
| `version` | string | 是 | 版本号 |
| `description` | string | 否 | 描述（MCP 中作为 tool description） |
| `target_origin` | string | 是 | 目标域名，用于 Cookie 获取 |
| `execution_mode` | string | 否 | `"http"`（axios）或 `"browser"`（浏览器内 fetch） |
| `parameters` | object | 否 | 参数定义 |
| `steps` | array | 否 | HTTP 请求步骤序列 |
| `output` | object | 否 | 输出定义 |
| `post_process` | string | 否 | 后置处理器名称 |

## parameters

```json
{
  "paramName": {
    "type": "string",
    "required": true,
    "default": "default",
    "description": "参数说明"
  }
}
```

`type` 支持: `string`, `number`, `boolean`

## steps

```json
{
  "id": "step1",
  "method": "GET",
  "url": "https://api.example.com/data",
  "headers": { "Authorization": "Bearer {{token}}" },
  "query": { "page": "{{page}}" },
  "body": { "key": "value" },
  "extract": { "items": "$.data.items" },
  "assert": { "status": 200 },
  "retry": 3
}
```

| 字段 | 说明 |
|------|------|
| `id` | 步骤标识，用于引用 |
| `method` | HTTP 方法: GET, POST, PUT, DELETE, PATCH |
| `url` | 请求 URL，支持模板变量 |
| `headers` | 请求头 |
| `query` | URL 查询参数 |
| `body` | 请求体 |
| `extract` | JSONPath 规则，提取响应数据 |
| `assert` | 断言规则 |
| `retry` | 重试次数 |

## extract / assert 中的 JSONPath

使用 `jsonpath-plus` 语法：

| 表达式 | 含义 |
|--------|------|
| `$.data` | 根对象的 data 字段 |
| `$.items[0]` | items 数组的第一个元素 |
| `$.items[*].name` | items 数组所有元素的 name 字段 |

## output

```json
{
  "summary": "获取到 {{items.length}} 条数据",
  "extract": { "items": "$.data.items" }
}
```

`summary` 支持模板变量：`{{paramName}}` 引用参数，`{{_stepId.response.path}}` 引用步骤结果。
