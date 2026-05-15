require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'jani-app');

const EMO_KEYS = ['미련', '외로움', '불안', '분노', '확인욕구'];

app.use(express.json({ limit: '8kb' }));
app.use(express.static(ROOT));

app.get('/demo', (_req, res) => {
  res.sendFile(path.join(ROOT, 'demo.html'));
});

function buildPrompt(message) {
  return `당신은 "자니..?" 앱의 감정 분석 AI입니다.
사용자가 전 애인·썸 상대에게내려는 메시지의 감정 성분과 전송 리스크를 분석하세요.

반드시 아래 JSON만 출력하세요. 다른 텍스트, 마크다운, 설명은 금지합니다.

{
  "emotions": {
    "미련": 0,
    "외로움": 0,
    "불안": 0,
    "분노": 0,
    "확인욕구": 0
  },
  "riskScore": 0,
  "riskLevel": "안전",
  "comment": "한 문장 조언"
}

규칙:
- emotions 값은 정수 퍼센트이며 합이 반드시 100
- riskScore는 0~100 정수
- riskLevel은 "안전", "주의", "위험" 중 하나
- comment는 40자 이내 한국어

분석할 메시지:
"""
${message}
"""`;
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

function normalizeResult(parsed) {
  const emotions = {};
  let sum = 0;

  EMO_KEYS.forEach((key) => {
    const n = Math.max(0, Math.round(Number(parsed?.emotions?.[key]) || 0));
    emotions[key] = n;
    sum += n;
  });

  if (sum === 0) {
    emotions['미련'] = 100;
    sum = 100;
  } else if (sum !== 100) {
    const scale = 100 / sum;
    let scaledSum = 0;
    EMO_KEYS.forEach((key, idx) => {
      if (idx === EMO_KEYS.length - 1) {
        emotions[key] = 100 - scaledSum;
      } else {
        emotions[key] = Math.round(emotions[key] * scale);
        scaledSum += emotions[key];
      }
    });
  }

  const riskScore = Math.min(100, Math.max(0, Math.round(Number(parsed?.riskScore) || 0)));
  const allowed = ['안전', '주의', '위험'];
  let riskLevel = String(parsed?.riskLevel || '').trim();
  if (!allowed.includes(riskLevel)) {
    riskLevel = riskScore >= 70 ? '위험' : riskScore >= 40 ? '주의' : '안전';
  }

  const comment = String(parsed?.comment || '잠깐 멈추고 다시 읽어보세요').slice(0, 80);

  return { emotions, riskScore, riskLevel, comment };
}

app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. 프로젝트 루트의 .env 파일을 확인하세요.',
    });
  }

  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: '메시지가 비어 있습니다.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: buildPrompt(message) }],
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const detail = payload?.error?.message || response.statusText;
      return res.status(response.status).json({ error: detail });
    }

    const text = payload?.content?.find((c) => c.type === 'text')?.text;
    if (!text) {
      return res.status(502).json({ error: 'AI 응답을 읽을 수 없습니다.' });
    }

    const parsed = extractJson(text);
    return res.json(normalizeResult(parsed));
  } catch (err) {
    console.error('[analyze]', err);
    return res.status(500).json({ error: '분석 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(`자니..? 서버 → http://localhost:${PORT}`);
  console.log(`데모 → http://localhost:${PORT}/demo`);
  console.log(hasKey ? 'API 키: 설정됨' : 'API 키: .env에 ANTHROPIC_API_KEY를 넣어주세요');
});
