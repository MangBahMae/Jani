const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// 정적 파일 경로 설정 (jani-app 폴더를 기본으로 설정)
app.use(express.static(path.join(__dirname, 'jani-app')));

// /demo 주소로 접속했을 때 jani-app 안의 demo.html 보여주기
app.get('/demo', (req, res) => {
    res.sendFile(path.join(__dirname, 'jani-app', 'demo.html'));
});

// 메인 주소(/)로 접속했을 때 index.html 보여주기
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'jani-app', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
});