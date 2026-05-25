"""CP-SAT Lambda handler smoke tests (no OR-Tools solve)."""
import json
import os
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "solver", "cpsat")
sys.path.insert(0, ROOT)

import lambda_handler  # noqa: E402


class TestLambdaHandler(unittest.TestCase):
    def test_health_get(self):
        event = {"requestContext": {"http": {"method": "GET"}}, "rawPath": "/health"}
        out = lambda_handler.handler(event, None)
        self.assertEqual(out["statusCode"], 200)
        body = json.loads(out["body"])
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("runtime"), "lambda")

    def test_unauthorized_when_secret_required(self):
        os.environ["CP_SAT_SOLVER_SECRET"] = "test-secret"
        try:
            event = {
                "requestContext": {"http": {"method": "POST"}},
                "rawPath": "/solve",
                "body": json.dumps({"contractVersion": "1.0.0", "tenant": {"workingDays": ["MONDAY"]}}),
            }
            out = lambda_handler.handler(event, None)
            self.assertEqual(out["statusCode"], 401)
        finally:
            del os.environ["CP_SAT_SOLVER_SECRET"]

    def test_direct_invoke_payload_shape(self):
        os.environ.pop("CP_SAT_SOLVER_SECRET", None)
        event = {
            "contractVersion": "1.0.0",
            "requestId": "test",
            "tenant": {
                "workingDays": ["MONDAY"],
                "periodSlots": [],
                "teachers": [],
                "divisions": [],
                "subjects": [],
                "schedulingRules": [],
                "subjectAllocations": [],
            },
            "options": {"timeLimitSec": 1},
        }
        out = lambda_handler.handler(event, None)
        self.assertEqual(out["statusCode"], 200)
        body = json.loads(out["body"])
        self.assertIn("solverStatus", body)


if __name__ == "__main__":
    unittest.main()
