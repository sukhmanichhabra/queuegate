const { Kafka } = require('kafkajs');

module.exports = async () => {
  console.log('\n[Global Setup] Waiting for Kafka topics to be fully initialized...');
  
  const kafka = new Kafka({
    clientId: 'queuegate-e2e-setup',
    brokers: [(process.env.KAFKA_BROKERS || 'localhost:9092')],
    logLevel: 0 // nothing
  });

  const producer = kafka.producer();
  
  // Also retry the connection in case Kafka isn't up at all yet, 
  // but the wait script in ci.yml ensures it's reachable.
  let connected = false;
  for (let i = 0; i < 15; i++) {
    try {
      await producer.connect();
      connected = true;
      break;
    } catch (err) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!connected) throw new Error("Could not connect to Kafka in global setup");

  const topics = ['queue.joined', 'queue.health_changed'];
  
  for (const topic of topics) {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await producer.send({
          topic,
          messages: [{ value: 'setup-ping' }],
        });
        ready = true;
        break;
      } catch (err) {
        if (err.message && err.message.includes('This server does not host this topic-partition')) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        // If it's a timeout or something else, we might want to retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!ready) {
      throw new Error(`Kafka topic ${topic} was not ready after retries.`);
    }
  }

  await producer.disconnect();
  console.log('[Global Setup] Kafka topics are ready.');
};
