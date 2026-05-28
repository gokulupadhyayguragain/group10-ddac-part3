# STEP 6 - Monitoring

## 1. What to monitor
- App health endpoint
- Backend logs
- Frontend and backend uptime
- Database connection health
- Lambda errors and duration
- SQS visible, in-flight, delayed, and oldest-message-age metrics
- SNS publish success/failure metrics

## 2. CloudWatch on EC2
1. Install the CloudWatch Agent on the EC2 host.
2. Send system metrics and application logs to CloudWatch.
3. Add alarms for high CPU, memory, or error spikes.

## 3. Lambda and API monitoring
- Lambda automatically reports invocations, errors, throttles, and duration.
- SQS should stay near zero for queue depth during normal operation.
- If API Gateway is added in front of the backend or Lambda, also capture latency and 4XX/5XX metrics.

## 4. X-Ray
1. Enable active tracing on the Lambda functions you deploy.
2. Use the service map to confirm the request flow.
3. Capture a screenshot for the report if tracing is enabled.

## 5. Evidence to include in the report
- CloudWatch metric graphs
- Alarm configuration
- SQS queue depth and oldest-message-age graphs
- Lambda trigger and Lambda log stream screenshots
- SNS topic subscription and publish metric screenshots
- SafeTrace Admin page AWS queue status screenshot
- X-Ray service map
- Screenshot of the app running in Docker or EC2

## 6. Quick log query example
```sql
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 20
```
