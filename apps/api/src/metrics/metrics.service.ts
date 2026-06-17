import { Injectable } from '@nestjs/common';
import { Registry, Gauge, Counter } from 'prom-client';

@Injectable()
export class MetricsService {
  private registry: Registry;
  public queueDepthGauge: Gauge<string>;
  public admissionRateGauge: Gauge<string>;
  public throttleActivationsCounter: Counter<string>;
  public checkoutErrorsCounter: Counter<string>;
  public kafkaConsumerConnectedGauge: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    this.queueDepthGauge = new Gauge({
      name: 'queue_depth_total',
      help: 'Current waiters per event',
      labelNames: ['event_id'],
      registers: [this.registry],
    });

    this.admissionRateGauge = new Gauge({
      name: 'admission_rate_per_min',
      help: 'Current configured admission rate per event',
      labelNames: ['event_id'],
      registers: [this.registry],
    });

    this.throttleActivationsCounter = new Counter({
      name: 'throttle_activations_total',
      help: 'Number of times auto-throttle has activated',
      registers: [this.registry],
    });

    this.checkoutErrorsCounter = new Counter({
      name: 'checkout_errors_total',
      help: 'Checkout errors',
      labelNames: ['event_id'],
      registers: [this.registry],
    });

    this.kafkaConsumerConnectedGauge = new Gauge({
      name: 'kafka_consumer_connected',
      help: 'Kafka health consumer connection status (1 = connected, 0 = disconnected)',
      registers: [this.registry],
    });
    this.kafkaConsumerConnectedGauge.set(0);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
