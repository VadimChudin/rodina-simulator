"""Normal lifecycle events must not become start-blocking alarms."""

import unittest

from backend.plant import Plant


class LifecycleTest(unittest.TestCase):
    def setUp(self):
        self.plant = Plant()

    def tearDown(self):
        self.plant._stop_evt.set()
        self.plant._thread.join(timeout=1)

    def test_start_stop_events_do_not_require_acknowledgment(self):
        plant = self.plant
        plant.set_estop(False)
        self.assertTrue(plant.reset_alarms()["ok"])
        self.assertTrue(plant.start_cleaning_mode({})["ok"])
        self.assertTrue(plant.stop_cleaning_mode()["ok"])
        self.assertFalse(any(a.active for a in plant.alarms))
        self.assertTrue(plant.start_cleaning_mode({})["ok"])
        self.assertTrue(any(a.message == "Запущен режим очистки" for a in plant.archive))

    def test_real_estop_still_requires_acknowledgment(self):
        plant = self.plant
        plant.set_estop(False)
        plant.reset_alarms()
        plant.set_estop(True)
        plant.set_estop(False)
        self.assertFalse(plant.start_cleaning_mode({})["ok"])
        self.assertTrue(plant.reset_alarms()["ok"])
        self.assertTrue(plant.start_cleaning_mode({})["ok"])


if __name__ == "__main__":
    unittest.main()
