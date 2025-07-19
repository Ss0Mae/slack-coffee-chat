# Slack Coffee Chat

This project is a simple Slack bot built with [@slack/bolt](https://slack.dev/bolt-js) that allows users to register information for casual "coffee chat" meetings.

## Features

- `/커피챗-등록` slash command opens a modal where users can input their MBTI and a short introduction.
- `/커피챗-참가` adds you to the next coffee-chat matching round.
- Submitted data is stored in a local SQLite database (`coffee_chat.db`). Existing records are updated on subsequent submissions.
- Every Tuesday and Thursday at 9 AM the bot pairs registered participants and sends each user a DM with their match. Pairings are generated using the OpenAI API when available.

## Development

1. Create a `.env` file with your Slack credentials and OpenAI key:
   ```
   SLACK_BOT_TOKEN=your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_APP_TOKEN=your-app-level-token
   OPENAI_API_KEY=your-openai-api-key
   ```
2. Install dependencies and start the bot:
   ```bash
   npm install
   node index.js
   ```

The bot listens on the port specified by the `PORT` environment variable (default `3000`).

## Database

User information is stored in `coffee_chat.db` with the following schema:

| column | type | description             |
| ------ | ---- | ----------------------- |
| id     | TEXT | Slack user ID (primary) |
| mbti   | TEXT | MBTI type               |
| intro  | TEXT | User introduction       |
| participating | INTEGER | 1 if the user is queued for matching |

