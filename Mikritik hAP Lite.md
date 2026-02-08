########################################################
Настройка Микротика Начало Передача с 3 ПТН на Мост

# Сброс конфигурации
/system reset-configuration no-defaults=yes

# Ждем перезагрузки, подключаемся по MAC через WinBox

# Создаем бридж
/interface bridge add name=bridge1 protocol-mode=rstp

# Все порты в бридж (равноправные)
/interface bridge port add bridge=bridge1 interface=ether1
/interface bridge port add bridge=bridge1 interface=ether2
/interface bridge port add bridge=bridge1 interface=ether3
/interface bridge port add bridge=bridge1 interface=ether4

# Отключаем WiFi (не нужен)
/interface wireless disable [find]

# Опционально: IP для управления
/ip address add address=192.168.88.1/24 interface=bridge1

# Сохраняем
/system backup save name=transparent-bridge


# Устройство системы передачи
[Устройство 1] ──ether2──┐
[Устройство 2] ──ether3──┼──[hAP lite]──ether1──→ [Приемник]
[Устройство 3] ──ether4──┘

########################################################
########################################################