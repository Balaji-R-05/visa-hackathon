# Regulation corpus

The policy-service indexes the documents in this folder so rule derivation can
retrieve, and cite, the clause a rule enforces. Put each document in the folder
of the jurisdiction it governs; `GLOBAL` is searched for every jurisdiction.

```
policy_corpus/
  GLOBAL/   PCI DSS, FATF Recommendations, ISO standards summaries
  IN/       RBI Master Directions, PMLA rules, DPDP Act
  EU/       GDPR, PSD2, AMLD
  US/       GLBA Safeguards Rule, BSA/AML regulations
```

Supported formats: `.txt`, `.md`, `.pdf`. Text files may start with header lines:

```
# code: RBI_KYC
# title: Master Direction - Know Your Customer (KYC) Direction, 2016
# authority: official          (official | excerpt | summary)
# url: <where the text was obtained>
```

`code` becomes the citation prefix (`RBI_KYC:Section 16`), so keep it short and
stable. Chunks are split on legal headings (Article, Section, Chapter,
Paragraph, Recommendation, Rule, Clause, or numbered headings), and numbered
paragraphs stay with their parent Article or Section.

After adding or changing documents, rebuild the index:

```
POST /policies/reindex        # through the policy-service; embeddings via Ollama when available
GET  /policies/stats          # chunk counts per jurisdiction and document
```

## What is here now

| File | Authority | Notes |
|---|---|---|
| `EU/gdpr_excerpt.txt` | excerpt | Articles 5 and 32 of the GDPR only |
| `IN/rbi_infosec_summary.txt` | summary | An unofficial paraphrase; replace before citing in a publication |

## Documents to add for the evaluation

Use the official text from the issuing body and record its URL in the header.
Check each document's reuse terms; PCI DSS in particular is licensed and may
only be used under the PCI SSC's document licence.

| Jurisdiction | Document | Issuer |
|---|---|---|
| IN | Master Direction – Know Your Customer (KYC) Direction, 2016 (as updated) | Reserve Bank of India (rbi.org.in) |
| IN | Storage of Payment System Data (circular, 2018) and FAQs | Reserve Bank of India |
| IN | Prevention of Money-laundering (Maintenance of Records) Rules, 2005 | Government of India / FIU-IND |
| IN | Digital Personal Data Protection Act, 2023 | Government of India (MeitY) |
| EU | Regulation (EU) 2016/679 (GDPR), full text | EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj |
| EU | Directive (EU) 2015/2366 (PSD2) | EUR-Lex |
| EU | Directive (EU) 2015/849 (AMLD4) | EUR-Lex |
| US | 16 CFR Part 314 (GLBA Safeguards Rule) | eCFR |
| US | 31 CFR Chapter X (BSA recordkeeping) | eCFR |
| GLOBAL | The FATF Recommendations | FATF (fatf-gafi.org) |
| GLOBAL | PCI DSS v4.0.1 | PCI Security Standards Council (licensed) |
