from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.app.main import GameMessageInput, GamePlayerActionInput, GameUnbanInput, _masked_ip


class GameManagementInputTests(unittest.TestCase):
    def test_message_is_trimmed(self) -> None:
        self.assertEqual(GameMessageInput(message="  训练家请注意  ").message, "训练家请注意")

    def test_message_requires_visible_content_and_has_limit(self) -> None:
        with self.assertRaises(ValidationError):
            GameMessageInput(message="   ")
        with self.assertRaises(ValidationError):
            GameMessageInput(message="a" * 281)

    def test_player_action_validates_id_and_message(self) -> None:
        value = GamePlayerActionInput(user_id="  steam_1234567890  ", message="请遵守规则")
        self.assertEqual(value.user_id, "steam_1234567890")
        self.assertEqual(value.message, "请遵守规则")
        with self.assertRaises(ValidationError):
            GamePlayerActionInput(user_id="steam 123", message="x")

    def test_unban_validates_id(self) -> None:
        self.assertEqual(GameUnbanInput(user_id="steam_42").user_id, "steam_42")
        with self.assertRaises(ValidationError):
            GameUnbanInput(user_id="steam_42\nother")

    def test_player_ip_is_masked_before_returning_to_browser(self) -> None:
        self.assertEqual(_masked_ip("192.168.1.88"), "192.168.1.*")
        self.assertEqual(_masked_ip("2001:db8:abcd:12::42"), "2001:0db8:abcd:0012:****:****:****:****")
        self.assertEqual(_masked_ip("not-an-ip"), "—")


if __name__ == "__main__":
    unittest.main()
