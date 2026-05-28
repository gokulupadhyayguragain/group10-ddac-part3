# SafeTrace – Alzheimer Wandering Alert & Community Response System
**Module:** CT071-3-3-DDAC – Designing & Developing Cloud Applications  
**Group:** Team 10 | APU / LBEF College

## Members
| # | ID | Name | Role |
|---|-----|------|------|
| 1 | NP069584 | Aayush Paneru | Auth & Profile Module |
| 2 | NP069822 | Gokul Upadhyay Guragain | Missing Person Reports & Map |
| 3 | NP069596 | Mohit Bhandari | Community Sightings & Alerts |
| 4 | NP069840 | Sugam Paudel | Admin Dashboard & Resources |

## Problem Statement
Scenario 3 - Alzheimer's disease wandering and missing elderly persons.

## System Overview
SafeTrace is a Docker-first TypeScript and Next.js application for missing-person reporting, community sightings, alerts, and admin monitoring.
Registration now uses rate-limited email verification. In AWS, put `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Secrets Manager with the database and JWT values.

## Package Map
| File | Purpose |
|------|---------|
| `00README.md` | Overview and quick start |
| `01STEP1_SETUP.md` | Local setup and runbook |
| `02STEP2_BACKEND.md` | Backend service notes |
| `03STEP3_FRONTEND.md` | Frontend service notes |
| `04STEP4_AWS_DEPLOY.md` | Task 1 EC2 / RDS server deployment |
| `05STEP5_SERVERLESS.md` | Task 2 serverless extension |
| `06STEP6_MONITORING.md` | CloudWatch and X-Ray |
| `07CLOUD_DEPLOYMENT_REQUIREMENTS.md` | Final cloud requirement checklist |
| `08DEVOPS_ARCHITECTURE.md` | Secrets and CI/CD architecture |
| `09FINAL_SUBMISSION_CHECKLIST.md` | Final assignment audit and evidence checklist |
| `10SECRETS_MANAGER_VALUES.md` | Complete Secrets Manager JSON and value sources |
| `AWS_ACADEMY_SHORT_BUILD_SHEET.md` | Short AWS Academy VPC/ALB/ASG/RDS build sheet |
| `GITHUB_AND_LAMBDA_DEPLOY.md` | GitHub push and Lambda zip upload guide |
| `references_apa7.xml` | APA 7 references |
| `WORKLOAD.docx` | Workload matrix |
| `*-REPORT.docx` | Final report |
| `*-PRESENTATION.pptx` | Presentation slides |

## Quick Start
1. Open the repo root.
2. For local development, leave `.env` absent or clear `SAFETRACE_SECRET_ID`.
3. Run `SAFETRACE_SECRET_ID= docker compose --profile local-db up --build -d` from the repo root.
4. Open `http://localhost:3000` and `http://localhost:5000/api/health`.
5. Run `SAFETRACE_SECRET_ID= docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e` for browser checks.

For Task 1 cloud deployment, do not enable `local-db`; set only `AWS_REGION` and `SAFETRACE_SECRET_ID` in `.env`. Put the full runtime JSON in AWS Secrets Manager.

## AWS Services Used
Task 1 is the full server-based app: EC2 + RDS PostgreSQL. Task 2 is a separate extension: S3 photo storage, API Gateway, Lambda, SQS, SNS, Secrets Manager, CloudWatch, and X-Ray.
