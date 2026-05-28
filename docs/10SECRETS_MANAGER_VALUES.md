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
  "FRONTEND_PUBLIC_URL": "http://<ec2-public-ip-or-domain>:3000",
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

## Task 2 Secret Additions

Add these after Task 1 is working:

```json
{
  "S3_BUCKET": "safetrace-photo-uploads-bucket",
  "S3_PUBLIC_BASE_URL": "https://<optional-cloudfront-domain>",
  "SIGHTING_EVENT_API_URL": "https://<api-id>.execute-api.us-east-1.amazonaws.com/sighting-events",
  "SIGHTING_EVENT_API_KEY": "<output-of-openssl-rand-hex-24>",
  "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/<account-id>/SafeTraceSightingQueue",
  "SNS_TOPIC_ARN": "arn:aws:sns:us-east-1:<account-id>:SafeTraceAlertsTopic"
}
```

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
| `S3_BUCKET` | S3 bucket name created for Task 2 photos |
| `S3_PUBLIC_BASE_URL` | Optional CloudFront distribution domain or public S3 base URL |
| `SIGHTING_EVENT_API_URL` | API Gateway HTTP API invoke URL for `POST /sighting-events` |
| `SIGHTING_EVENT_API_KEY` | Run `openssl rand -hex 24`; optional demo shared key |
| `SQS_QUEUE_URL` | SQS console -> queue -> URL |
| `SNS_TOPIC_ARN` | SNS console -> topic -> ARN |

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
