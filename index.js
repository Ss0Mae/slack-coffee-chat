require('dotenv').config();
const { App } = require('@slack/bolt');

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

// Modal 제출 이벤트 리스너
app.view('coffee_chat_view', async ({ ack, body, view, client }) => {
  await ack();

  const user = body.user.id;
  const mbti = view.state.values.mbti_block.mbti_input.value;
  const intro = view.state.values.intro_block.intro_input.value;

  // TODO: 이 데이터를 DB에 저장하는 로직을 구현합니다.
  console.log(`${user}님의 정보: MBTI=${mbti}, 소개=${intro}`);

  try {
    await client.chat.postMessage({
      channel: user,
      text: '커피챗 정보가 성공적으로 등록되었습니다! 매칭을 기대해주세요.'
    });
  } catch (error) {
    console.error(error);
  }
});


(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
