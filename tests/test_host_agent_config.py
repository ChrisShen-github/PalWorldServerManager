from __future__ import annotations

import importlib.util
import asyncio
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("palworld_host_agent", ROOT / "host-agent" / "agent.py")
assert SPEC and SPEC.loader
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class HostAgentConfigTests(unittest.TestCase):
    def test_empty_target_uses_default_then_initializes_with_backup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            server = Path(directory)
            default = server / "DefaultPalWorldSettings.ini"
            target = server / "Pal" / "Saved" / "Config" / "LinuxServer" / "PalWorldSettings.ini"
            target.parent.mkdir(parents=True)
            target.write_text("\n", encoding="utf-8")
            default.write_text(
                "; default\n[/Script/Pal.PalGameWorldSettings]\n"
                'OptionSettings=(ServerName="Default",AdminPassword="secret",ServerPassword="",'
                "CrossplayPlatforms=(Steam,Xbox),ExpRate=1.000000,UnknownFuture=KeepMe)\n",
                encoding="utf-8",
            )

            with patch.object(AGENT, "checked_path", return_value=server), patch.object(AGENT, "run", return_value=""):
                loaded = AGENT.read_server_config({"server_path": "/opt/palserver"})
                self.assertEqual(loaded["config"]["source"], "default-invalid")
                self.assertEqual(loaded["config"]["options"]["CrossplayPlatforms"], ["Steam", "Xbox"])
                self.assertTrue(loaded["config"]["passwords"]["admin"])
                self.assertNotIn("AdminPassword", loaded["config"]["options"])

                result = AGENT.write_server_config({
                    "server_path": "/opt/palserver",
                    "config": {"options": {
                        "ServerName": "训练家测试服",
                        "AdminPassword": "new-secret",
                        "CrossplayPlatforms": ["Steam", "PS5"],
                        "ExpRate": 2.5,
                        "RESTAPIPort": 8212,
                    }},
                })

            content = target.read_text(encoding="utf-8")
            self.assertIn('ServerName="训练家测试服"', content)
            self.assertIn('AdminPassword="new-secret"', content)
            self.assertIn("CrossplayPlatforms=(Steam,PS5)", content)
            self.assertIn("ExpRate=2.500000", content)
            self.assertIn("RESTAPIEnabled=True", content)
            self.assertIn("UnknownFuture=KeepMe", content)
            self.assertEqual(len(list(target.parent.glob("PalWorldSettings.ini.manager-*.bak"))), 1)
            self.assertIn("已初始化", result["message"])

    def test_rejects_unknown_or_out_of_range_options(self) -> None:
        with self.assertRaisesRegex(ValueError, "不允许"):
            AGENT.validated_config({"options": {"ExecCommand": "no"}})
        with self.assertRaisesRegex(ValueError, "1 到 10"):
            AGENT.validated_config({"options": {"BaseCampMaxNumInGuild": 11}})

    def test_frontend_fields_are_allowed_by_agent(self) -> None:
        source = (ROOT / "frontend" / "src" / "serverConfigFields.ts").read_text(encoding="utf-8")
        frontend_keys = re.findall(r'(?:text|area|password|number|toggle|select|multi)\("([A-Za-z][A-Za-z0-9_]*)"', source)
        self.assertEqual(len(frontend_keys), len(set(frontend_keys)), "frontend config keys must be unique")
        self.assertGreaterEqual(len(frontend_keys), 80)
        self.assertEqual(set(frontend_keys) - AGENT.EDITABLE_OPTION_KEYS, set())

    def test_agent_detects_atomic_source_update(self) -> None:
        async def scenario() -> None:
            with tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / "agent.py"
                replacement = Path(directory) / "agent.py.new"
                source.write_text("old", encoding="utf-8")
                task = asyncio.create_task(AGENT.wait_for_agent_update(source, interval=0.01))
                await asyncio.sleep(0.02)
                replacement.write_text("new version", encoding="utf-8")
                os.replace(replacement, source)
                await asyncio.wait_for(task, timeout=1)

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
