const express = require('express');

const app = express();
const PORT = 3000;

console.log('开始启动服务器...');

app.get('/', (req, res) => {
    res.send('服务器正常工作');
});

app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('服务器启动成功！');
});