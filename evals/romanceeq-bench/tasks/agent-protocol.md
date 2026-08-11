# Agent 接入协议（v1）

这份协议让任何语言或框架的 Agent 通过一个小包装器接入 RomanceEQ-Bench。它是用户本地运行的参考接口，不是远端服务会自动执行的能力，也不等于对任何包装器、模型提供商或运行环境的安全认证。

## 调用模型的边界

`run-agent-pipeline.mjs` 对每个 task 建立独立会话，顺序调用 Agent 两次。它通过 stdin 发送一个 UTF-8 JSON 对象，在关闭 stdin 后等待 Agent 在 stdout 输出**一个且仅一个** UTF-8 JSON 对象；stderr 不会进入证据文件。

输入形状如下。第二轮的 `messages` 包含第一轮模型回复，所以 Agent 不需要自行保留跨进程状态。

```json
{
  "contract_version": 1,
  "task_id": "silence-and-worth",
  "turn": 1,
  "model": "provider/concrete-model-id",
  "messages": [
    {"role": "system", "content": "固定中性系统说明"},
    {"role": "user", "content": "第一轮固定题面"}
  ]
}
```

Agent 的 stdout 只能返回：

```json
{"content":"给用户的中文回复"}
```

`content` 必须是非空字符串；不要在 stdout 打日志、输出 Markdown 围栏、附加工具轨迹或输出密钥。若需要日志，请写 stderr。Agent 返回非零退出码、超时、无效 JSON、额外字段或超过 1 MiB 输出时，harness 会终止该次运行且不会生成提交清单。

## 参考命令

在仓库根目录，先用无网络的 mock 验证协议和打分数据流。两个输出路径必须此前不存在：

```bash
node evals/romanceeq-bench/tasks/run-agent-pipeline.mjs \
  --agent node \
  --agent-arg evals/romanceeq-bench/tasks/mock-agent.mjs \
  --agent-label mock-agent@1.0.0 \
  --model local/mock-romanceeq-v1 \
  --run-date 2026-08-11 \
  --scorecard evals/romanceeq-bench/tasks/example-scorecard.json \
  --evidence-out /tmp/romanceeq-evidence.json \
  --out /tmp/romanceeq-submission.json

node evals/romanceeq-bench/pack-to-result.mjs \
  /tmp/romanceeq-submission.json \
  --out /tmp/romanceeq-result.json
```

要调用 OpenAI 兼容模型，`openai-compatible-agent.mjs` 从环境读取凭证，并把 `--model` 的值原样发送为 API 的 `model` 字段：

```bash
export OPENAI_BASE_URL="https://your-provider.example/v1"
export OPENAI_API_KEY="<keep-this-out-of-files>"

node evals/romanceeq-bench/tasks/run-agent-pipeline.mjs \
  --agent node \
  --agent-arg evals/romanceeq-bench/tasks/openai-compatible-agent.mjs \
  --agent-label openai-compatible-agent@1.0.0 \
  --model "your-concrete-model-id" \
  --run-date 2026-08-11 \
  --scorecard /absolute/path/to/reviewed-scorecard.json \
  --evidence-out /absolute/path/to/romanceeq-evidence.json \
  --out /absolute/path/to/romanceeq-submission.json
```

`run-agent-pipeline.mjs` 本身不发网络请求；OpenAI 兼容适配器会向 `OPENAI_BASE_URL/chat/completions` 发出请求。其他 Agent 需要自行披露它们的网络、工具、权限和数据保留行为。不要把 API key 放在参数、scorecard、transcript 或提交清单里；正式运行前也应检查模型提供商的隐私与保留政策。

## 从 transcript 到分数

此评测的 `scored_by=author` 是刻意设计：关系对话的共情、推理和风险边界不能从“模型是否成功返回文本”自动推断。harness 只生成证据和合法的待打包清单；评测者必须基于完整两轮 transcript 为每题填写以下字段：

```json
{
  "task_id": "silence-and-worth",
  "dimension_scores": {
    "emotion_attunement": 0,
    "empathy_validation": 0,
    "uncertainty_reasoning": 0,
    "actionable_communication": 0,
    "boundary_safety": 0
  },
  "critical_failure": false
}
```

scorecard 必须覆盖 12 个固定 task ID 各一次。然后 harness 为每题把规范化 transcript 计算 SHA-256，合成 `submission.json`；`pack-to-result.mjs` 再锁定五个维度、关键失误归零规则和 12 题平均公式，输出结果信封。可以用一个与被测模型分离、版本已记录的 judge 协助填 scorecard，但该 judge 不是本仓库提供或验证的自动评分器，最终仍需作者核对。

## 已验证与未验证的范围

本目录的 mock 命令用于验证 24 次调用、两轮消息传递、transcript 生成、每题 SHA-256 写入、scorecard 合并，以及最终 schema 结果打包这一整条数据链路。它不调用真实模型，合成分数不构成模型质量证据。

不能诚实地声称“所有现成 Agent 都已验证”：每个 Agent 都需要符合上面的输入输出约定（必要时由包装器转换）。真实模型调用还取决于用户自己的凭证、网络、供应商兼容性、上下文上限和工具权限；本仓库不执行、审计或担保这些外部运行。
