"""Đối chiếu pad/net PCB Rev C với chân firmware, không cần KiCad hay tải thật."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PCB_PATH = ROOT / 'AI gen/KiCad/RevC/scentstation-rev-c.kicad_pcb'


def parse_sexpr(source):
    stack, roots = [], []
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[^\s()]+|[()]', source):
        if token == '(':
            node = []
            (stack[-1] if stack else roots).append(node)
            stack.append(node)
        elif token == ')':
            stack.pop()
        else:
            stack[-1].append(token.strip('"'))
    return roots[0]


def children(node, kind):
    return [item for item in node if isinstance(item, list) and item and item[0] == kind]


@unittest.skipUnless(PCB_PATH.is_file(), 'Local PCB in AI gen is not included in the repository')
class RevCPinmap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pcb = parse_sexpr(PCB_PATH.read_text(encoding='utf-8'))
        cls.pads = {}
        for footprint in children(pcb, 'footprint'):
            ref = next(p[2] for p in children(footprint, 'property') if p[1] == 'Reference')
            cls.pads[ref] = {p[1]: children(p, 'net')[0][2] for p in children(footprint, 'pad') if children(p, 'net')}
        cls.firmware = (ROOT / 'arduino/ScentStationValveDevice/ScentStationValveDevice.ino').read_text(encoding='utf-8')
        cls.config = (ROOT / 'arduino/ScentStationValveDevice/config.example.h').read_text(encoding='utf-8')

    def test_pumps_lights_buttons(self):
        for name, gpios, ref, pins in [
            ('PUMP', [25, 18, 19, 21, 22], 'U1', ['2', '3', '4', '5', '6']),
            ('LIGHT', [26, 23, 32, 33, 13], 'U2', ['4', '5', '6', '7', '8']),
        ]:
            actual = re.search(name + r'_PINS\[SLOT_COUNT\] = \{([^}]+)\}', self.firmware)
            self.assertIsNotNone(actual)
            self.assertEqual([int(x) for x in actual[1].split(',')], gpios)
            self.assertEqual([self.pads[ref][pin] for pin in pins], [f'GPIO{x}' for x in gpios])
        gpios = [27, 34, 35, 36, 39]
        actual = re.search(r'BUTTON_PINS\[SLOT_COUNT\] = \{([^}]+)\}', self.firmware)
        self.assertEqual([int(x) for x in actual[1].split(',')], gpios)
        for i, gpio in enumerate(gpios, 1):
            self.assertEqual(self.pads[f'JBTN{i}'], {'1': 'GND', '2': f'GPIO{gpio}'})

    def test_expander_gate_watchdog(self):
        self.assertEqual(self.pads['JPCF1'], dict(zip(map(str, range(1, 11)), ['3V3', 'GND', 'GPIO16', 'GPIO17'] + [f'PCF_P0{i}' for i in range(6)])))
        for macro, value in [('VALVE_I2C_SDA', 16), ('VALVE_I2C_SCL', 17), ('LOAD_RUN_REQUEST_PIN', 14), ('DRIVER_WATCHDOG_PIN', 4)]:
            self.assertRegex(self.config, rf'#define {macro}\s+{value}\b')
            self.assertRegex(self.firmware, rf'#define {macro}\s+{value}\b')
        self.assertEqual(self.pads['U6']['2'], 'GPIO4')
        for pin, net in [('1', 'PCF_P00'), ('2', 'VALVE1'), ('3', 'PCF_P01'), ('4', 'VALVE2'), ('5', 'PCF_P02'), ('6', 'VALVE3'), ('9', 'PCF_P03'), ('8', 'VALVE4'), ('11', 'PCF_P04'), ('10', 'VALVE5'), ('13', 'PCF_P05'), ('12', 'EXP_READY')]:
            self.assertEqual(self.pads['U5'][pin], net)

    def test_revc_power_changes(self):
        self.assertEqual(self.pads['J12'], {'1': '12V_IN', '2': 'GND'})
        self.assertEqual(self.pads['F1'], {'1': '12V_IN', '2': '12V_LOAD'})
        for i in range(11, 16):
            self.assertEqual(self.pads[f'D{i}'], {'1': '12V_LOAD', '2': f'DRAIN{i}'})
        self.assertEqual(self.pads['JSTOP1'], {'1': 'WD_OK', '2': 'WD_LINK'})


if __name__ == '__main__':
    unittest.main()
