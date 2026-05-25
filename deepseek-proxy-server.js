/**
 * Studley DeepSeek 本地代理服务器（修复版 - 使用原生 fetch）
 */
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '2mb' }));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 错误：未找到 DEEPSEEK_API_KEY，请检查 .env 文件');
  process.exit(1);
}

console.log('✅ DeepSeek Proxy 已启动');

// 核心接口
app.post('/api/generate-questions', async (req, res) => {
  try {
    const { material, questionCount = 4 } = req.body;

    if (!material || material.length < 20) {
      return res.status(400).json({ error: '材料内容太短' });
    }

    const systemPrompt = `你是一位严格遵循「第一性原理 + 四步公式」的资深学习内容设计师。
请根据用户提供的材料，严格按照以下四步公式生成高质量选择题。

【四步公式】
Step1 二元转折：锚定核心概念的正确基准状态与错误偏差状态
Step2 行为分化：不同判断标准对应的具体可落地动作
Step3 因果推演：错误行为导致的环环相扣必然结果链
Step4 本质升维：从表象升维到系统模型的本质区别

只返回 JSON 数组，不要有任何多余文字。格式如下：
[
  {
    "id": 1,
    "step": 1,
    "stepName": "二元转折·概念锚定",
    "question": "...",
    "options": ["正确状态", "错误状态", "干扰项1", "干扰项2"],
    "correctIndex": 0,
    "explanation": "..."
  }
]`;

    const userPrompt = `材料内容：\n"""\n${material}\n"""\n\n请严格按照四步公式生成 ${questionCount} 道高质量选择题。`;

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API 错误:', response.status, errorText);
      return res.status(500).json({ error: `DeepSeek API 调用失败: ${response.status}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'DeepSeek 返回内容为空' });
    }

    // 清理可能存在的 markdown 代码块
    const cleaned = content.replace(/```json|```/g, '').trim();
    let questions;
    try {
      questions = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON 解析失败，原始内容:', content);
      return res.status(500).json({ error: 'LLM 返回的不是有效 JSON' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: '生成的题目格式不正确' });
    }

    console.log(`✅ 成功生成 ${questions.length} 道题`);
    res.json({ questions });

  } catch (err) {
    console.error('代理服务器内部错误:', err);
    res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Studley DeepSeek Proxy 运行中`);
  console.log(`   监听端口: http://localhost:${PORT}`);
  console.log(`   前端请访问: http://localhost:${PORT}/api/generate-questions`);
});