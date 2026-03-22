# DQS-AI Agent

DQS-AI Agent is a FastAPI-based microservice that provides intelligent data quality analysis and remediation capabilities. It leverages Groq's LLMs to analyze data quality issues, generate remediation reports, and provide conversational AI assistance for data governance tasks.

## Features

- **Data Quality Analysis**: Analyzes datasets for completeness, accuracy, consistency, uniqueness, and timeliness.
- **Remediation Reporting**: Generates professional Markdown reports with actionable insights and remediation steps.
- **Conversational AI**: Provides an interactive chat interface for data governance queries.
- **Streaming Responses**: Supports real-time streaming for chat interactions.
- **Health Monitoring**: Built-in health check endpoints for monitoring and observability.

## Real-World Impact

In the complex landscape of global payments, DQS-AI addresses critical data challenges:

- **Regulatory Compliance (KYC/AML)**: Automatically identifies missing or malformed identity fields, ensuring readiness for audits and reducing the risk of regulatory fines.
- **Operational Efficiency**: Drastically reduces the time spent by data stewards on manual investigations by providing natural-language explanations of technical anomalies.
- **Trust in Analytics**: By providing a standardized, objective Data Quality Score (0-100), organizations can finally trust the dashboards and reports used for strategic decision-making.
- **Risk Mitigation**: Detects stale records and payment method inconsistencies that could lead to transaction failures or fraudulent activities.

## Why DQS-AI? (The Differentiator)

Traditional data quality tools (like Great Expectations, AWS Deequ, or Soda Core) rely on static, manually authored rules. DQS-AI introduces a **Hybrid (Rules + GenAI)** approach:

| Feature | Traditional Tools | DQS-AI Agent |
|---------|-------------------|---------------|
| **Logic** | Static Rule-based | Deterministic + Generative |
| **Explainability** | ❌ None (Pass/Fail) | ✅ Natural Language Insights |
| **Fix Actions** | ❌ Manual | ✅ AI-Recommended Prioritized Fixes |
| **Domain Awareness**| ❌ Generic | ✅ FinTech/Payments Context-aware |
| **Stakeholder UX** | Technical only | Auditor & Business Friendly |

While traditional tools tell you *what* failed, DQS-AI tells you **why it matters** (e.g., "This missing KYC field violates RBI compliance") and **how to fix it** immediately.

## 🚀 Future Roadmap

DQS-AI is evolving towards a fully autonomous data governance agent:

- **RAG-Powered Compliance**: Moving from static rules to a Vector DB (Pinecone/Chroma) that retrieves real-time regulatory clauses (RBI, GDPR) to justify data quality scores.
- **Specialized Fine-tuning**: Training domain-specific models (Llama-3-8B) to better understand complex payment schemas and reduce inference latency.
- **Self-Healing Data**: Automated generation of remediation scripts to fix identified data issues in the source systems.
- **Streaming Integration**: Extending support to Kafka and RabbitMQ for real-time data quality monitoring in high-velocity transaction pipelines.

### Project Structure

```
ai-services/
├── core/              # Core utilities (config, logger)
├── schemas/           # Pydantic data models
├── services/          # Business logic (dq_analyzer, llm_service)
├── routers/           # API endpoints
├── main.py            # Application entry point
└── requirements.txt   # Dependencies
```