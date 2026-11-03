import { afterEach, vi } from "vite-plus/test";

// Prevent dotenv-mono from loading the local .env file during tests.
// All env vars are set explicitly below; the .env file must be ignored.
vi.mock("dotenv-mono", () => ({
  config: () => {},
}));

// Intelia fork (design 21 §4.9 in software-factory): no development .env and no
// localhost:5432 default. DATABASE_URL comes only from
// scripts/ci/intelia-test-integration.sh; global-setup.ts checks its server
// mark once, before any test file loads.

process.env.NODE_ENV = "test";
process.env.AUTH_SECRET = "test-secret-with-at-least-32-chars";
process.env.KANEO_API_URL = "http://localhost:1337";
process.env.KANEO_CLIENT_URL = "http://localhost:5173";
process.env.DISABLE_GUEST_ACCESS = "false";
process.env.DISABLE_REGISTRATION = "false";
process.env.DISABLE_PASSWORD_REGISTRATION = "false";
process.env.DISABLE_EMAIL_OTP_SIGN_IN = "false";
process.env.DISABLE_LOGIN_FORM = "";
process.env.DEMO_MODE = "false";
process.env.SMTP_HOST = "";
process.env.SMTP_PORT = "";
process.env.SMTP_SECURE = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASSWORD = "";
process.env.GITHUB_OAUTH_CLIENT_ID = "";
process.env.GITHUB_OAUTH_CLIENT_SECRET = "";
process.env.GITHUB_CLIENT_ID = "";
process.env.GITHUB_CLIENT_SECRET = "";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
process.env.DISCORD_CLIENT_ID = "";
process.env.DISCORD_CLIENT_SECRET = "";
process.env.CUSTOM_OAUTH_CLIENT_ID = "";
process.env.CUSTOM_OAUTH_CLIENT_SECRET = "";
process.env.CUSTOM_OAUTH_AUTHORIZATION_URL = "";
process.env.CUSTOM_OAUTH_TOKEN_URL = "";
process.env.CUSTOM_OAUTH_USER_INFO_URL = "";
process.env.CUSTOM_OAUTH_SCOPES = "";
process.env.CUSTOM_OAUTH_RESPONSE_TYPE = "";
process.env.CUSTOM_OAUTH_DISCOVERY_URL = "";
process.env.CUSTOM_OAUTH_BACKCHANNEL_LOGOUT = "";
process.env.CUSTOM_OAUTH_AUTO_LOGIN = "";
process.env.CUSTOM_OAUTH_NAME = "";
process.env.CUSTOM_OAUTH_MANAGED_PROFILE_FIELDS = "";
process.env.CUSTOM_OAUTH_ACCOUNT_URL = "";
process.env.DEVICE_AUTH_CLIENT_IDS = "kaneo-cli";
// Intelia fork: upstream's tests create tasks without the automation level;
// intelia-task-automation.test.ts stubs this off to test the rule.
process.env.INTELIA_TASK_AUTOMATION_OPTIONAL = "true";
// Same for the initiative (README-INTELIA.md, «Iniciativas»);
// intelia-initiatives.test.ts stubs it off.
process.env.INTELIA_TASK_INITIATIVE_OPTIONAL = "true";

afterEach(() => {
  vi.restoreAllMocks();
});
