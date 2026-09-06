# CDPI Pass — Vault Home

Event management + ticketing platform for CDPI Pharma. Prod: https://cdpipass.com.br

## Map
- [[00-Overview/Project-Overview|Project Overview]]
- [[00-Overview/Lessons-Learned|Lessons Learned (mistakes + prevention)]]
- [[10-Architecture/Stack|Stack]] · [[10-Architecture/Architecture-Overview|Architecture & Request Flow]]
- [[20-Backend/API-Endpoints|API Endpoints]] · [[20-Backend/Services-Overview|Services]] · [[20-Backend/Workers-and-Middleware|Workers & Middleware]] · [[20-Backend/Print-Coordinator|Print Coordinator (WebSocket)]] · [[20-Backend/Certificates|Certificates (Lambda PDF)]]
- [[30-Frontend/Frontend-Overview|Frontend: pages, routing, conventions]]
- [[40-Database/Schema-Overview|DB Schema + ER Diagram]] · [[40-Database/Normalization-History|Normalization History]] · [[40-Database/Migration-Workflow|Migration Workflow (manual SQL)]]
- [[50-Infrastructure/Deployment|Deployment (EC2/Docker/PM2)]] · [[50-Infrastructure/AWS-Services|AWS Services]] · [[50-Infrastructure/Neon-Database|Neon Database]] · [[50-Infrastructure/Environment-Variables|Env Vars]]
- [[60-Decisions/README|Decisions (ADRs)]]
- [[70-Operations/Operator-Guides|Operator Guides Index]]
- [[70-Operations/Verifying-UI-Fixes|Verifying UI Fixes]] · [[70-Operations/Security-Backlog|Security Backlog (prioritized, evidence-backed)]]

## Fast access (obsidian-cli)
```bash
obsidian vault=CDPI-Pass-Vault files                        # list notes
obsidian vault=CDPI-Pass-Vault search query="..."           # search (paths)
obsidian vault=CDPI-Pass-Vault search:context query="..."   # search with context lines
obsidian vault=CDPI-Pass-Vault read file="20-Backend/API-Endpoints.md"
obsidian vault=CDPI-Pass-Vault open file=Home.md            # open in app
```

Repo code lives in `/Users/cauecasonato/Envs/CDPI-Pass/frontend` (the actual full-stack app, despite the folder name).
