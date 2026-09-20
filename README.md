# Langfuse Observability Plugin for MiniMax Code

这个插件把 MiniMax Code 的每个 Agent turn 上传到 Langfuse，形成可检索的 Agent trace：

- 一个 `MiniMax Code Turn` agent observation 对应一次 Stop Hook 对应的 turn；
- 每次模型响应对应一个 `LLM` generation；
- 模型发起的 shell、编辑、MCP 和其他工具调用对应 tool observations；
- 同一个 MiniMax session 使用 Langfuse session id 归组；
- MiniMax 的子 agent 会被独立记录，并保留 session、turn、agent type 等元数据。

实现参考 [Langfuse Codex Observability Plugin](https://github.com/langfuse/codex-observability-plugin)，但使用 MiniMax Code 原生的 `.minimax-plugin` 和 `Stop` Hook。MiniMax Code 在 Hook 生命周期内提供临时 Codex JSONL 投影，插件优先读取同目录的 `.codex.jsonl`，因此不需要修改 MiniMax Code 主仓库。

## 安装

在 MiniMax Code 的插件目录中放置本项目（目录名可以保持 `langfuse-observability`）。从本地目录导入时，插件根目录必须包含：

```text
.minimax-plugin/plugin.json
hooks/hooks.json
dist/index.mjs
```

先安装依赖并构建单文件 Hook：

```bash
pnpm install
pnpm build
```

随后通过 MiniMax Code 的本地 Plugin 安装入口导入这个目录并启用插件。MiniMax Code 会把 `${MINIMAX_PLUGIN_ROOT}` 替换为插件根目录。

## 配置

默认关闭上传，必须显式设置 `enabled: true`。安装到 MiniMax Code 后推荐使用全局配置文件（Hook runner 会过滤子进程环境变量）：

文件路径：`~/.minimax-code/langfuse.json`

```json
{
  "enabled": true,
  "public_key": "pk-lf-...",
  "secret_key": "sk-lf-...",
  "base_url": "https://cloud.langfuse.com"
}
```

直接运行 Hook、做本地调试或宿主显式透传环境变量时，也可以使用：

```bash
export TRACE_TO_LANGFUSE=true
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

也可以使用项目级 `.minimax/langfuse.json`。配置合并顺序是：默认值 → 全局文件 → 项目文件 → 环境变量，环境变量优先。对于 MiniMax Code 的实际 Hook 子进程，环境变量通常不会被宿主透传，所以应把凭证放在 JSON 配置中。

| 配置            | 环境变量                                              | 默认值                       | 说明                                     |
| --------------- | ----------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| `enabled`       | `TRACE_TO_LANGFUSE`                                   | `false`                      | 是否上传 trace                           |
| `public_key`    | `LANGFUSE_MINIMAX_PUBLIC_KEY` / `LANGFUSE_PUBLIC_KEY` | —                            | Langfuse public key                      |
| `secret_key`    | `LANGFUSE_MINIMAX_SECRET_KEY` / `LANGFUSE_SECRET_KEY` | —                            | Langfuse secret key                      |
| `base_url`      | `LANGFUSE_MINIMAX_BASE_URL` / `LANGFUSE_BASE_URL`     | `https://cloud.langfuse.com` | Langfuse 区域或自托管地址                |
| `environment`   | `LANGFUSE_MINIMAX_ENVIRONMENT`                        | —                            | trace 环境标签                           |
| `user_id`       | `LANGFUSE_MINIMAX_USER_ID`                            | —                            | 用户标识                                 |
| `tags`          | `LANGFUSE_MINIMAX_TAGS`                               | —                            | JSON 数组或逗号分隔                      |
| `metadata`      | `LANGFUSE_MINIMAX_METADATA`                           | —                            | JSON object                              |
| `trace_seed`    | `LANGFUSE_MINIMAX_TRACE_SEED`                         | —                            | 用 `seed:session:turn` 派生稳定 trace id |
| `max_chars`     | `LANGFUSE_MINIMAX_MAX_CHARS`                          | `20000`                      | 输入输出截断长度                         |
| `debug`         | `LANGFUSE_MINIMAX_DEBUG`                              | `false`                      | 输出诊断日志到 stderr                    |
| `fail_on_error` | `LANGFUSE_MINIMAX_FAIL_ON_ERROR`                      | `false`                      | 上传失败时让 Hook 返回非零               |

凭证按 Langfuse 项目绑定。EU、US、Japan 和 HIPAA 区域使用对应的 `LANGFUSE_BASE_URL`。

## 数据和隐私

启用后，插件会发送用户 prompt、模型文本、工具参数和工具输出，以及 session、turn、model、cwd 等元数据。MiniMax Code 的临时 transcript 会在 Hook 生命周期结束后清理；插件只在 `${PLUGIN_DATA}` 中保留小型去重状态。不要对包含不应外传内容的 session 开启 tracing，可以用 `max_chars` 限制单个字段大小。

MiniMax 的临时 Codex 投影没有 provider token usage 和完整的模型生命周期事件，因此当前版本不会伪造 token 数量；Langfuse 中 generation 的 `usageDetails` 为空。若 MiniMax 后续在 Hook payload 中公开 usage，可在 `src/transcript.ts` 和 `src/trace.ts` 增加映射。

## 开发和验证

```bash
pnpm test
pnpm lint:tsc
pnpm build
```

`dist/index.mjs` 是运行时实际执行的自包含 Hook，修改 `src/` 后必须重新构建。Hook 采用 fail-open 策略，默认不会阻塞 MiniMax Code；调试时可同时设置 `LANGFUSE_MINIMAX_DEBUG=true` 和 `LANGFUSE_MINIMAX_FAIL_ON_ERROR=true`。

## License

MIT
