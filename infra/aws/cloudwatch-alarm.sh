#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# QueueGate — AWS CloudWatch Billing Alarm Setup
#
# Run this from your local machine (requires AWS CLI configured).
# Creates a billing alarm at $30/month and a basic EC2 CPU alarm.
#
# Prerequisites:
#   brew install awscli
#   aws configure   (enter your Access Key ID + Secret + region us-east-1)
#
# Usage:
#   bash infra/aws/cloudwatch-alarm.sh <your-email> <ec2-instance-id>
#   Example:
#   bash infra/aws/cloudwatch-alarm.sh you@gmail.com i-0abc123def456789
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ALERT_EMAIL="${1:-}"
INSTANCE_ID="${2:-}"

[[ -z "$ALERT_EMAIL" ]] && { echo "Usage: $0 <email> <ec2-instance-id>"; exit 1; }
[[ -z "$INSTANCE_ID" ]] && { echo "Usage: $0 <email> <ec2-instance-id>"; exit 1; }

echo "Setting up CloudWatch alarms..."
echo "  Email:       $ALERT_EMAIL"
echo "  Instance ID: $INSTANCE_ID"

# ── 1. Create SNS Topic for alert notifications ───────────────────────────────
echo ""
echo "[1/5] Creating SNS topic..."
TOPIC_ARN=$(aws sns create-topic \
  --name QueueGateAlerts \
  --region us-east-1 \
  --query 'TopicArn' \
  --output text)
echo "  Topic ARN: $TOPIC_ARN"

# Subscribe your email to the topic
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --region us-east-1 > /dev/null
echo "  ✓ Subscription confirmation sent to $ALERT_EMAIL — check your inbox!"

# ── 2. Billing alarm ($30 threshold) ─────────────────────────────────────────
# NOTE: Billing metrics are only available in us-east-1
echo ""
echo "[2/5] Creating billing alarm at \$30/month..."
aws cloudwatch put-metric-alarm \
  --alarm-name "QueueGate-BillingAlert-30USD" \
  --alarm-description "QueueGate: AWS charges exceeded \$30 this month" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 30 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions "$TOPIC_ARN" \
  --treat-missing-data notBreaching \
  --region us-east-1
echo "  ✓ Billing alarm created at \$30"

# Also create a early warning at $10
aws cloudwatch put-metric-alarm \
  --alarm-name "QueueGate-BillingAlert-10USD" \
  --alarm-description "QueueGate: AWS charges exceeded \$10 this month (early warning)" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions "$TOPIC_ARN" \
  --treat-missing-data notBreaching \
  --region us-east-1
echo "  ✓ Early warning alarm created at \$10"

# ── 3. EC2 CPU alarm (detect runaway process) ─────────────────────────────────
# Kafka or BullMQ spinning can peg the CPU on t2.micro
echo ""
echo "[3/5] Creating EC2 CPU alarm (>85% for 10 min)..."
aws cloudwatch put-metric-alarm \
  --alarm-name "QueueGate-EC2-HighCPU" \
  --alarm-description "QueueGate EC2: CPU > 85% for 10 minutes — possible runaway process" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions "Name=InstanceId,Value=$INSTANCE_ID" \
  --alarm-actions "$TOPIC_ARN" \
  --region us-east-1
echo "  ✓ CPU alarm created"

# ── 4. EC2 disk space alarm (via custom metric — requires CloudWatch agent) ───
echo ""
echo "[4/5] Note: Disk space monitoring requires the CloudWatch Agent."
echo "  To install it on EC2:"
echo "    sudo apt-get install -y amazon-cloudwatch-agent"
echo "    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard"
echo "  This is optional but recommended to catch disk fill (logs, Docker images)."

# ── 5. Enable AWS Free Tier alerts ───────────────────────────────────────────
echo ""
echo "[5/5] Enabling Free Tier usage alerts..."
# This can only be done via the console, so we print the instructions
echo "  ✓ Manual step: Go to:"
echo "    https://console.aws.amazon.com/billing/home#/preferences"
echo "    → Check 'Receive Free Tier Usage Alerts'"
echo "    → Enter email: $ALERT_EMAIL"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  CloudWatch Setup Complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Alarms created:"
echo "  • QueueGate-BillingAlert-10USD  (early warning)"
echo "  • QueueGate-BillingAlert-30USD  (hard limit)"
echo "  • QueueGate-EC2-HighCPU         (runaway process)"
echo ""
echo "IMPORTANT: Confirm your SNS email subscription before alarms will fire."
echo "Check your inbox at: $ALERT_EMAIL"
