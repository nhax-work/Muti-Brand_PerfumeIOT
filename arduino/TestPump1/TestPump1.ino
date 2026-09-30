// ===== ScentStation - Bài test 1 =====

const uint8_t PIN_BOM = 25;   // PWM module M1
const uint8_t PIN_DEN = 26;   // PWM module M2
const uint8_t PIN_NUT = 27;   // Dây NO của nút bấm

const unsigned long THOI_GIAN_BOM = 500; // 500 ms, không vượt 800 ms

// Module AOD4184 dự kiến kích mức HIGH
const uint8_t BAT = HIGH;
const uint8_t TAT = LOW;

void setup() {
  Serial.begin(115200);

  // Đặt trạng thái an toàn ngay khi khởi động
  pinMode(PIN_BOM, OUTPUT);
  pinMode(PIN_DEN, OUTPUT);

  digitalWrite(PIN_BOM, TAT); // Bơm phải tắt
  digitalWrite(PIN_DEN, BAT); // Đèn nút sáng khi sẵn sàng

  // NO nối GPIO27, COM nối GND
  pinMode(PIN_NUT, INPUT_PULLUP);

  Serial.println("ScentStation - Test 1");
  Serial.println("He thong san sang");
}

void loop() {
  // Khi bấm nút, GPIO27 bị kéo xuống GND
  if (digitalRead(PIN_NUT) == LOW) {
    delay(30); // Chống dội nút

    if (digitalRead(PIN_NUT) == LOW) {
      Serial.println("Da bam nut");

      // Tắt đèn và bật bơm
      digitalWrite(PIN_DEN, TAT);
      digitalWrite(PIN_BOM, BAT);

      Serial.println("Bom BAT");
      delay(THOI_GIAN_BOM);

      // Tắt bơm trước, sau đó bật lại đèn
      digitalWrite(PIN_BOM, TAT);
      digitalWrite(PIN_DEN, BAT);

      Serial.println("Bom TAT - Den BAT");

      // Chờ người dùng nhả nút để không kích hoạt liên tục
      while (digitalRead(PIN_NUT) == LOW) {
        delay(10);
      }

      delay(30);
      Serial.println("San sang cho lan tiep theo");
    }
  }
}