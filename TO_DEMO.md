# Follow The Money — Demo & Presentation Guide
## Fraudster Monsters · Agency 2026 Ottawa · April 29, 2026

---

## Part 1: Video Screen Recording (3–5 min)

### Setup
- Run `bash docker-rebuild.sh clean -d` and wait for backend health check
- Open `http://localhost:3000` in Chrome (dark mode, full screen)
- Clear browser cache if needed

### Recording Script

**[0:00–0:20] Opening — Home Page**
- Show the hero: "We mapped 91,129 Canadian charities, 1.27M federal grant records, and 15,533 procurement contracts."
- Scroll to show all 10 challenges listed
- Say: *"Follow The Money is an AI-powered investigative platform. We ingested 10 gigabytes of official Canadian government open data and built autonomous AI agents that investigate accountability failures no human could trace by hand."*

**[0:20–0:50] Dashboard — The Headlines**
- Click "Enter Investigation Dashboard"
- Show the 6 finding cards: Zombies, Loops, Directors, Sole-Source, Vendor Concentration, AI Investigator
- Say: *"Our dashboard surfaces the highest-impact findings. 219 zombie charities received public funding then vanished. 5,808 circular funding loops may inflate charitable tax receipts. And thousands of directors sit on multiple government-funded boards simultaneously."*

**[0:50–1:30] Challenge #1 — Zombie Recipients (the hook)**
- Click "Zombie Recipients"
- Show the table with years_inactive column
- Expand one entity, click "Investigate" to go to Entity Case File
- Say: *"These are organizations that received 70% or more of their revenue from government, then stopped filing. The question is simple: did the public get anything for its money, or did it fund a disappearing act?"*

**[1:30–2:10] Challenge #3 — Funding Loops (the visual)**
- Navigate to Funding Loops
- Show the network graph tab — visually impressive
- Point out hub nodes (red, larger) and the shared_directors count
- Filter to "High Alert" loops
- Say: *"We detected 5,808 circular gift flows using strongly connected component analysis. When the same dollar travels a 5-hop loop in the same fiscal year, it generates 5 separate charitable tax receipts for a single donation. Our AI flags loops where participants share board members — the smoking gun for self-dealing."*

**[2:10–2:50] Challenge #2 — Ghost Capacity (the insight)**
- Navigate to Ghost Capacity
- Filter to "Critical" risk
- Point out the program_spending_pct column
- Say: *"Ghost Capacity is different from zombies. These organizations are still alive — still filing, still funded — but report zero employees and spend almost nothing on actual programs. Where does the money go? Compensation for a tiny number of individuals, or transfers to other entities."*

**[2:50–3:30] AI Investigator — The Differentiator**
- Navigate to "Ask AI"
- Type: "Investigate the highest-risk entity across all categories"
- Wait for response — show the tool badges (search_alerts, get_entity_dossier, etc.)
- Show the markdown table rendering
- Say: *"This is not a chatbot. This is an autonomous AI investigator with 12 database tools. It decides which queries to run, cross-references findings across all 10 challenges, and builds an investigative narrative. It's using Claude via AWS Bedrock with native tool use — the AI is actually reasoning about the data."*

**[3:30–4:00] Cross-Challenge Alerts**
- Navigate to Multi-Flag Alerts
- Show entities flagged in 3+ categories
- Click one to open Entity Case File
- Say: *"The real power is intersection. When an entity is a zombie, participates in funding loops, AND has directors on multiple boards — that's not a coincidence. These cross-challenge alerts are where investigators should start."*

**[4:00–4:20] Closing**
- Navigate back to Home
- Say: *"Every number is real. Every finding is computed from official Canadian government data — CRA T3010 filings, Federal Proactive Disclosure, and Alberta Open Data. Nothing scraped, nothing estimated. Follow The Money."*

---

## Part 2: Live Presentation (5–7 min)

### Audience
Ministers, Deputy Ministers, senior public sector officials, academics, industry reps. **Not a tech audience.** Lead with findings, not architecture.

### Opening (30 sec)
> "Good afternoon. We're the Fraudster Monsters team. We built an AI system that reads 10 gigabytes of Canadian government spending data and finds patterns that would take a human auditor years to trace. We call it Follow The Money."

### The Three Headlines (60 sec)
> "Here are three things we found:
>
> **First:** 219 charities received significant public funding — more than 70% of their revenue came from government — and then stopped filing with CRA. Some received federal grants *after* they stopped filing. The money went into a void.
>
> **Second:** We detected 5,808 circular funding flows between charities. In the worst cases, the same dollar circulates in the same fiscal year, generating multiple charitable tax receipts for a single donation. Our AI identified loops where participants share board members — that's not normal charity networking, that's coordinated self-dealing.
>
> **Third:** We found organizations that have been receiving government money for years but report zero employees and near-zero program spending. They're not zombies — zombies die. These are ghost capacity entities. They persist indefinitely, absorbing public funds into compensation for a handful of individuals."

### The AI (60 sec)
> "What makes this different from a dashboard is our AI investigator. It's not a chatbot that answers questions — it's an autonomous agent that investigates. When you tell it to investigate an entity, it searches our database, pulls the full dossier, cross-references funding loops, checks governance networks, and generates an investigative narrative. It decides what to look at. We built this using Claude on AWS Bedrock with native tool use — the AI has 12 investigative tools and can chain up to 6 queries per investigation."

### The Demo (2–3 min)
- Show the live dashboard on screen
- Walk through ONE compelling entity — start with Alerts, click into Entity Case File
- Show the AI chat investigating that entity in real-time
- Point out cross-challenge intersection: "This entity is a zombie, in 3 funding loops, with directors on 5 other boards"

### The Data (30 sec)
> "Every finding is computed from official public records. CRA T3010 charity filings — the annual returns that every registered charity must submit. Federal Proactive Disclosure — grant records from 51 departments. Alberta Open Data — procurement contracts and grants. We built a DuckDB analytical engine that queries 10 gigabytes of raw JSONL in real time, with entity resolution across all three data sources."

### Why This Matters (30 sec)
> "The Government of Canada distributes billions of dollars through grants, contributions, and contracts. The data exists to verify where that money goes. But it's scattered across departments, formats, and jurisdictions. No single auditor can trace a dollar from a federal department through a charity, into a funding loop, and back again. Our AI can. And it does it in seconds."

### Close (15 sec)
> "We're the Fraudster Monsters. This is Follow The Money. All 10 challenges implemented. 91,129 charities mapped. One AI investigator to find what humans can't. Thank you."

---

## Key Talking Points for Q&A

**"How accurate is the name matching?"**
> "For governance networks, we use first name + last name matching restricted to government-funded charities only. This eliminates most false positives but not all — common names like 'John Smith' can still collide. We acknowledge this in the methodology panel and use a 5-board minimum for headline stats to reduce noise."

**"Is the AI making things up?"**
> "No. The AI has zero training data about these entities. Every claim in its responses comes from a database tool call — you can see the tool badges on each response. It calls search_zombies, get_entity_dossier, etc. and reasons over the actual data. No hallucination is possible because it's citing the database, not its training."

**"How would this be used in practice?"**
> "An auditor would start at the Multi-Flag Alerts page — entities flagged across multiple categories. They'd click into the Entity Case File for a full dossier. Then they'd ask the AI investigator to cross-reference and generate a narrative. The output is an investigation lead, not a verdict."

**"What about false positives?"**
> "We score risk, we don't assign guilt. A 3-hop funding loop between denominational charities is structurally normal. Our suspicion scoring accounts for this — hub organizations get negative points. The methodology panels on every page explain exactly what we're measuring and why."

**"Why DuckDB instead of PostgreSQL?"**
> "We run both. DuckDB gives us real-time analytical queries on 10GB of raw JSONL — no ETL pipeline, no data warehouse. PostgreSQL provides entity resolution with 851,000 golden records linking all three data sources. The sidebar shows dual-DB mode active."

---

## Technical Differentiators to Highlight

1. **Agentic AI** — Not prompt-response, actual tool_use with multi-turn reasoning
2. **All 10 challenges** — Complete coverage of the hackathon problem set
3. **Cross-challenge intersection** — Entities flagged across multiple categories
4. **Real data only** — No hardcoded numbers, no fabricated findings
5. **Entity resolution** — Golden records linking CRA + Federal + Alberta datasets
6. **DuckDB + PostgreSQL dual mode** — Real-time analytics + cross-dataset resolution
7. **10GB scale** — Not a toy dataset, real government records at production scale
