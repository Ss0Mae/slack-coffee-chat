require('dotenv').config();
const { App } = require('@slack/bolt');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const { OpenAI } = require('openai');

// SQLite database initialization
const db = new sqlite3.Database('./coffee_chat.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    mbti TEXT,
    intro TEXT,
    participating INTEGER DEFAULT 0
  )`);
  // Ensure the participating column exists for older databases
  db.run('ALTER TABLE users ADD COLUMN participating INTEGER DEFAULT 0', () => {});
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// '/커피챗-등록' 명령어 리스너
app.command('/커피챗-등록', async ({ ack, body, client }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'coffee_chat_view',
        title: {
          type: 'plain_text',
          text: '커피챗 정보 등록'
        },
        blocks: [
          // 여기에 MBTI, 관심분야 등 입력 필드를 추가합니다.
          {
            type: 'input',
            block_id: 'mbti_block',
            label: { type: 'plain_text', text: 'MBTI' },
            element: { type: 'plain_text_input', action_id: 'mbti_input' }
          },
          {
            type: 'input',
            block_id: 'intro_block',
            label: { type: 'plain_text', text: '간단한 자기소개' },
            element: { type: 'plain_text_input', multiline: true, action_id: 'intro_input' }
          }
        ],
        submit: {
          type: 'plain_text',
          text: '제출'
        }
      }
    });
  } catch (error) {
    console.error(error);
  }
});

// '/커피챗-참가' 명령어 리스너 - 매칭 후보로 등록
app.command('/커피챗-참가', async ({ ack, body, client }) => {
  await ack();
  const userId = body.user_id;
  db.get('SELECT mbti, intro FROM users WHERE id=?', [userId], async (err, row) => {
    if (err) {
      console.error(err);
      return;
    }

    if (!row || !row.mbti || !row.intro) {
      await client.chat.postMessage({
        channel: userId,
        text: '먼저 /커피챗-등록 으로 MBTI와 소개를 등록해주세요.'
      });
      return;
    }

    db.run(
      `INSERT INTO users (id, participating) VALUES (?, 1)
       ON CONFLICT(id) DO UPDATE SET participating=1`,
      [userId]
    );

    await client.chat.postMessage({
      channel: userId,
      text: '이번 주 커피챗 매칭 후보로 등록되었습니다.'
    });
  });
});

// Modal 제출 이벤트 리스너
app.view('coffee_chat_view', async ({ ack, body, view, client }) => {
  await ack();

  const user = body.user.id;
  const mbti = view.state.values.mbti_block.mbti_input.value;
  const intro = view.state.values.intro_block.intro_input.value;

  // Save or update the user's information in the SQLite database
  db.run(
    `INSERT INTO users (id, mbti, intro) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET mbti=excluded.mbti, intro=excluded.intro`,
    [user, mbti, intro],
    (err) => {
      if (err) {
        console.error('DB 저장 중 오류 발생:', err);
      } else {
        console.log(`${user}님의 정보가 저장되었습니다.`);
      }
    }
  );

  try {
    await client.chat.postMessage({
      channel: user,
      text: '커피챗 정보가 성공적으로 등록되었습니다! 매칭을 기대해주세요.'
    });
  } catch (error) {
    console.error(error);
  }
});

// 매칭을 생성하기 위한 기본 랜덤 페어링 함수
function simplePair(ids) {
  const shuffled = ids.sort(() => Math.random() - 0.5);
  const pairs = [];
  while (shuffled.length) {
    pairs.push(shuffled.splice(0, 2));
  }
  return pairs;
}

// OpenAI를 사용하여 사용자 매칭을 생성
async function generatePairs(users) {
  if (!process.env.OPENAI_API_KEY) {
    return simplePair(users.map((u) => u.id));
  }

  const info = users
    .map((u) => `${u.id}: MBTI=${u.mbti}, 소개=${u.intro}`)
    .join('\n');
  const prompt =
    info +
    '\n위 사용자들을 최대한 잘 어울리도록 1대1로 짝지어 주세요. JSON 형식의 배열로 사용자 ID 두 개씩 묶어 출력해 주세요.';

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });
    const text = res.choices[0].message.content.trim();
    return JSON.parse(text);
  } catch (e) {
    console.error('OpenAI 매칭 실패', e);
    return simplePair(users.map((u) => u.id));
  }
}

async function runMatchingJob() {
  db.all('SELECT id, mbti, intro FROM users WHERE participating=1', async (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    if (rows.length === 0) {
      return;
    }

    const pairs = await generatePairs(rows);

    for (const pair of pairs) {
      if (pair.length < 2) {
        await app.client.chat.postMessage({
          channel: pair[0],
          text: '이번 매칭에는 함께할 상대가 없었습니다. 다음 기회를 기다려!~!!',
        });
      } else {
        const [a, b] = pair;
        await app.client.chat.postMessage({
          channel: a,
          text: `<@${b}> 님과 매칭되었습니다! 즐거운 커피챗 되세요.`,
        });
        await app.client.chat.postMessage({
          channel: b,
          text: `<@${a}> 님과 매칭되었습니다! 즐거운 커피챗 되세요`,
        });
      }
    }

    // Reset participation after matching
    db.run('UPDATE users SET participating=0 WHERE participating=1');
  });
}

// 매주 화, 목 오전 9시에 매칭 실행
cron.schedule('0 9 * * 2,4', runMatchingJob);


(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
