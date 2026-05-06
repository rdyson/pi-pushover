# pi-pushover

Send a [Pushover](https://pushover.net) push notification when [Pi](https://pi.dev) finishes an agent task and is ready for input again.

This is the Pi-native version of a Cursor notification relay: instead of watching desktop notification logs, it hooks directly into Pi's `agent_end` lifecycle event. It works well over SSH, tmux, and headless Linux sessions.

## Install

From npm:

```bash
pi install npm:@rdyson/pi-pushover
```

From GitHub:

```bash
pi install git:github.com/rdyson/pi-pushover
```

For a pinned GitHub version/tag:

```bash
pi install git:github.com/rdyson/pi-pushover@v0.1.0
```

For local development:

```bash
pi install /path/to/pi-pushover
```

Then restart Pi or run:

```text
/reload
```

## Configure

Create a config file:

```bash
mkdir -p ~/.config/pi-notifications
chmod 700 ~/.config/pi-notifications
cp examples/pushover.env.example ~/.config/pi-notifications/pushover.env
chmod 600 ~/.config/pi-notifications/pushover.env
vim ~/.config/pi-notifications/pushover.env
```

Required values:

```bash
export PUSHOVER_TOKEN="your-pushover-app-token"
export PUSHOVER_USER="your-pushover-user-key"
```

You can also provide these as normal environment variables instead of using the config file. Environment variables override values in the config file.

## Test

Inside Pi:

```text
/pushover-test
```

Or with a custom test message:

```text
/pushover-test hello from pi
```

## Behavior

On each completed Pi agent task, the extension sends a message like:

```text
Finished in 42s (my-project)
```

If the Pi session has a name, the message includes it:

```text
Finished in 2m 05s — Refactor auth flow (my-project)
```

The footer shows:

- `pushover on` when configured
- `pushover unconfigured` when the extension is loaded but missing credentials

## Configuration

The extension reads this file by default:

```bash
~/.config/pi-notifications/pushover.env
```

Override the config file path:

```bash
export PI_PUSHOVER_ENV_FILE=/path/to/pushover.env
```

Supported settings:

```bash
# Required
export PUSHOVER_TOKEN="your-pushover-app-token"
export PUSHOVER_USER="your-pushover-user-key"

# Optional
export PI_PUSHOVER_ENABLED=1
export PI_PUSHOVER_TITLE="Pi"
export PI_PUSHOVER_MIN_SECONDS=0

# Optional Pushover API fields
export PI_PUSHOVER_PRIORITY=0
export PI_PUSHOVER_DEVICE="your-device-name"
export PI_PUSHOVER_SOUND="pushover"
export PI_PUSHOVER_MESSAGE="Pi finished"
export PI_PUSHOVER_URL="https://example.com"
export PI_PUSHOVER_URL_TITLE="Open"
```

### Minimum duration

Use `PI_PUSHOVER_MIN_SECONDS` to avoid notifications for tiny tasks:

```bash
export PI_PUSHOVER_MIN_SECONDS=10
```

With this setting, only tasks that take at least 10 seconds trigger a notification.

### Disable temporarily

```bash
export PI_PUSHOVER_ENABLED=0
```

## Development

Run tests:

```bash
npm test
```

Check package contents before publishing:

```bash
npm pack --dry-run
```

Publish to npm:

```bash
npm publish --access public
```

## Security

Keep your real `pushover.env` file out of git and readable only by you:

```bash
chmod 600 ~/.config/pi-notifications/pushover.env
```

Pi extensions run with your full user permissions. Review any extension before installing it.
