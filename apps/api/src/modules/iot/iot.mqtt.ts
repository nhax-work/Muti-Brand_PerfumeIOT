import { Inject, Injectable, Logger } from '@nestjs/common';
import { MqttClientAdapter } from '../../adapters/mqtt/mqtt.client.js';
import { allDevicesTopic, deviceTopic, serialFromTopic } from '../../adapters/mqtt/topics.js';
import { EventMessage, HeartbeatMessage, TelemetryMessage } from './iot.messages.js';
import { IotService } from './iot.service.js';

@Injectable()
export class IotMqttGateway {
  private readonly logger = new Logger('IOT/MQTT');
  private started = false;
  private running = false;

  constructor(
    @Inject(MqttClientAdapter) private readonly mqtt: MqttClientAdapter,
    @Inject(IotService) private readonly iot: IotService,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const suffix of ['heartbeat', 'telemetry', 'event'] as const) {
      this.mqtt.subscribe(allDevicesTopic(suffix), suffix === 'event' ? 1 : 0, (topic, payload) =>
        this.receive(suffix, topic, payload),
      );
    }
  }

  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await this.iot.sweepConnections();
      if (this.mqtt.connected) {
        await this.iot.syncConfigurations((message) =>
          this.mqtt.publish(deviceTopic(message.machineSerial, 'config'), message.payload, {
            qos: 1,
            retain: true,
          }),
        );
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Device synchronization failed: ${String(error)}`);
      return false;
    } finally {
      this.running = false;
    }
  }

  private async receive(
    suffix: 'heartbeat' | 'telemetry' | 'event',
    topic: string,
    payload: Buffer,
  ): Promise<void> {
    const serial = serialFromTopic(topic, suffix);
    if (!serial || payload.length > 65536) return;
    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (suffix === 'heartbeat') {
      const message = HeartbeatMessage.safeParse(raw);
      if (message.success && message.data.machine_serial === serial)
        await this.iot.heartbeat(message.data);
    } else if (suffix === 'telemetry') {
      const message = TelemetryMessage.safeParse(raw);
      if (message.success && message.data.machine_serial === serial)
        await this.iot.telemetry(message.data);
    } else {
      const message = EventMessage.safeParse(raw);
      if (message.success && message.data.machine_serial === serial)
        await this.iot.event(message.data);
    }
  }
}
