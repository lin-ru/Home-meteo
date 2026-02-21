#include <Wire.h>
#include "Adafruit_SHT31.h"

Adafruit_SHT31 sht31;
uint8_t detectedAddress = 0; // 0 - не найден, иначе 0x44 или 0x45
unsigned long lastAttempt = 0;
bool sensorOK = false;

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  Wire.begin();
  Serial.println("Starting SHT31 scanner...");
}

void loop() {
  // Если датчик не инициализирован или был сбой, пытаемся его найти/переинициализировать каждые 5 секунд
  if (!sensorOK) {
    if (millis() - lastAttempt > 5000) {
      lastAttempt = millis();
      attemptInit();
    }
    // Индикация ошибки: быстро мигаем (5 раз в секунду)
    digitalWrite(13, HIGH);
    delay(100);
    digitalWrite(13, LOW);
    delay(100);
    return; // не идём дальше, пока нет датчика
  }

  // Если датчик работает, читаем данные каждые 30 секунд (как у вас)
  static unsigned long lastRead = 0;
  if (millis() - lastRead > 30000) {
    lastRead = millis();
    readAndPrint();
  }

  // Небольшая задержка для устойчивости
  delay(10);
}

// Функция попытки инициализации датчика
void attemptInit() {
  Serial.println("Scanning I2C bus for SHT31...");
  
  // Массив возможных адресов (вместо {0x44,0x45} с range-for)
  uint8_t addresses[] = {0x44, 0x45};
  for (int i = 0; i < 2; i++) {
    uint8_t addr = addresses[i];
    if (sht31.begin(addr)) {
      // Проверим, действительно ли датчик отвечает (прочитаем что-нибудь)
      float t = sht31.readTemperature();
      if (!isnan(t)) {
        detectedAddress = addr;
        sensorOK = true;
        Serial.print("SHT31 found at address 0x");
        Serial.print(addr, HEX);
        Serial.println("! Sensor ready.");
        digitalWrite(13, LOW); // погасим светодиод
        return;
      }
    }
  }

  // Если не нашли, возможно адрес другой. Запустим полный I2C-скан
  Serial.println("No SHT31 found at 0x44 or 0x45. Check wiring!");
  Serial.println("Running full I2C scan to see all devices...");
  fullI2CScan();
}

// Функция полного сканирования I2C (выводит все найденные устройства)
void fullI2CScan() {
  byte error, address;
  int nDevices = 0;
  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at address 0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.println(" !");
      nDevices++;
    }
  }
  if (nDevices == 0)
    Serial.println("No I2C devices found");
  else
    Serial.println("Scan done");
}

// Функция чтения и вывода данных
void readAndPrint() {
  float temp = sht31.readTemperature();
  float hum = sht31.readHumidity();

  if (!isnan(temp) && !isnan(hum)) {
    Serial.print(temp);
    Serial.print(" ");
    Serial.println(hum);
    // Короткая вспышка при успешном чтении
    digitalWrite(13, HIGH);
    delay(50);
    digitalWrite(13, LOW);
  } else {
    Serial.println("Read error, reinitializing...");
    sensorOK = false; // Сброс флага, чтобы цикл попытался переинициализировать
  }
}