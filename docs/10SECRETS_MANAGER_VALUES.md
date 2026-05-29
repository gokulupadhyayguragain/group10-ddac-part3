# Secrets Manager Values

Use one AWS Secrets Manager JSON secret for SafeTrace:

- Secret name: `safetrace/prod/app`
- Region: `us-east-1`
- EC2 `.env` contains only `AWS_REGION=us-east-1` and `SAFETRACE_SECRET_ID=safetrace/prod/app`
- Do not put real database passwords, JWT secrets, Resend keys, Google secrets, S3/SQS/SNS values, or API keys in local files.

## Task 1 Secret JSON

Create this first for the EC2 + RDS deployment:

```json
{
  "DATABASE_URL": "postgresql://safetrace:<rds-password>@<rds-endpoint>:5432/safetrace",
  "JWT_SECRET": "<output-of-openssl-rand-base64-48>",
  "AWS_REGION": "us-east-1",
  "FRONTEND_PUBLIC_URL": "http://<alb-dns-name-or-domain>",
  "RESEND_API_KEY": "re_xxxxxxxxxxxxxxxxx",
  "RESEND_FROM_EMAIL": "verify@<your-verified-domain>",
  "AUTH_VERIFICATION_TTL_MINUTES": "10",
  "TRUST_PROXY": "false"
}
```

Use `TRUST_PROXY=true` only when the app is behind Nginx, an Application Load Balancer, or another trusted reverse proxy.

## Optional Google OAuth Values

Add these only if Google login will be demonstrated:

```json
{
  "GOOGLE_CLIENT_ID": "<google-oauth-client-id>",
  "GOOGLE_CLIENT_SECRET": "<google-oauth-client-secret>",
  "GOOGLE_OAUTH_CALLBACK_URL": "https://<public-domain>/api/auth/google/callback"
}
```

## Phase B Full Serverless Secret

Do not mix Phase B values into the Phase A EC2 secret. The full serverless stack creates and uses a separate secret named:

```text
safetrace/serverless/app
```

It contains:

```json
{
  "TABLE_NAME": "<DynamoDB table name>",
  "PHOTO_BUCKET": "<private photo bucket>",
  "SQS_QUEUE_URL": "<alert queue URL>",
  "SNS_TOPIC_ARN": "<alert topic ARN>",
  "AWS_REGION": "us-east-1",
  "CORS_ORIGIN": "*",
  "AUTH_DEV_EXPOSE_VERIFICATION_CODE": "true",
  "RESEND_API_KEY": "<optional-resend-api-key>",
  "RESEND_FROM_EMAIL": "<optional-verified-resend-sender>",
  "JWT_SECRET": "<generated>"
}
```

The `serverless-api` Lambda reads this secret through `SAFETRACE_SECRET_ID`. Set `AUTH_DEV_EXPOSE_VERIFICATION_CODE=true` for classroom demos where you need the code visible in the response. Set it to `false` when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured for real email delivery.

## Where Each Value Comes From

| Value | Where to get it |
|---|---|
| `DATABASE_URL` | RDS console -> database endpoint, plus the DB username/password you created. Format: `postgresql://user:password@endpoint:5432/dbname` |
| `JWT_SECRET` | Run `openssl rand -base64 48` locally or in CloudShell |
| `AWS_REGION` | AWS console region selector. Use `us-east-1` for this project unless you intentionally deploy elsewhere |
| `FRONTEND_PUBLIC_URL` | EC2 public URL, Nginx HTTPS domain, or load balancer URL |
| `RESEND_API_KEY` | Resend dashboard -> API Keys -> Create API key |
| `RESEND_FROM_EMAIL` | Resend dashboard -> Domains. Use an email on a verified domain; for testing, `onboarding@resend.dev` can work with Resend limits |
| `AUTH_VERIFICATION_TTL_MINUTES` | Choose `10` for coursework demo |
| `TRUST_PROXY` | `false` for raw EC2 ports, `true` behind Nginx/ALB |
| `GOOGLE_CLIENT_ID` | Google Cloud Console -> APIs & Services -> Credentials -> OAuth client |
| `GOOGLE_CLIENT_SECRET` | Same Google OAuth client details page |
| `GOOGLE_OAUTH_CALLBACK_URL` | Public backend callback URL, usually `https://<domain>/api/auth/google/callback` |
| `TABLE_NAME` | DynamoDB console -> table name. Use `my-app-table` for the GUI runbook |
| `PHOTO_BUCKET` | S3 console -> private photo bucket. Use `group10-alzheimer-photos-<account-id>` |
| `S3_BUCKET` | Legacy Phase A extension alias for photo bucket; use `PHOTO_BUCKET` in Phase B |
| `SQS_QUEUE_URL` | SQS console -> queue -> URL |
| `SNS_TOPIC_ARN` | SNS console -> topic -> ARN |
| `CORS_ORIGIN` | Use `*` for simple AWS Academy demo or the S3 website URL for stricter production |

## AWS CLI Create Command

Create the secret after replacing placeholders:

```bash
aws secretsmanager create-secret \
  --region us-east-1 \
  --name safetrace/prod/app \
  --secret-string file://safetrace-prod-secret.json
```

Update the same secret later:

```bash
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id safetrace/prod/app \
  --secret-string file://safetrace-prod-secret.json
```

The file `safetrace-prod-secret.json` is only a temporary local working file. Delete it after the secret is stored:

```bash
rm safetrace-prod-secret.json
```
