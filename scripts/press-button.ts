import 'dotenv/config';
import { connect } from 'mqtt';

const serial = process.argv[3] || 'M001';
const slot = process.argv[2] ? Number(process.argv[2]) : 1;
const broker = process.env['MQTT_URL'] || 'mqtt://localhost:1883';

if (!Number.isInteger(slot) || slot < 1) {
  console.error('Vui lòng chỉ định số slot hợp lệ. Ví dụ: npm run sim:press 4');
  process.exit(1);
}

const client = connect(broker, { clientId: `press-cli-${Date.now()}` });

client.on('connect', () => {
  const topic = `scentstation/${serial}/button`;
  client.publish(topic, String(slot), { qos: 1 }, (err) => {
    if (err) {
      console.error(`Lỗi gửi sự kiện bấm nút: ${err.message}`);
      process.exit(1);
    }
    console.log(`\n👉 ĐÃ BẤM NÚT SỐ ${slot} TRÊN MÁY ${serial} THÀNH CÔNG!`);
    client.end();
    process.exit(0);
  });
});

client.on('error', (err) => {
  console.error(`Lỗi kết nối MQTT: ${err.message}`);
  process.exit(1);
});
