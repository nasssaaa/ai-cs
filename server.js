const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const WebSocket = require('ws');
const http = require('http');

// 确保logs目录存在
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('创建logs目录成功');
}

// 日志记录函数
function logChat(userMessage, aiResponse, logFile) {
    const timestamp = new Date();
    const logEntry = {
        timestamp: timestamp.toISOString(),
        user: userMessage,
        ai: aiResponse
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
        if (logFile) {
            fs.appendFileSync(logFile, logLine, 'utf8');
            console.log('聊天记录已写入连接日志文件:', logFile);
        } else {
            const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
            const defaultLogFile = path.join(logsDir, `${dateStr}.log`);
            fs.appendFileSync(defaultLogFile, logLine, 'utf8');
            console.log('聊天记录已写入默认日志文件:', defaultLogFile);
        }
    } catch (error) {
        console.error('写入日志失败:', error);
    }
}

const openai = new OpenAI({
    apiKey: 'sk-e82ebe05118e482e9e2069baf1589acc',
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
});

const app = express();
const PORT = process.env.PORT || 3000;

// 从文件读取prompt内容
let prompt;
try {
    prompt = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
    console.log('成功从prompt.txt读取系统提示内容');
} catch (error) {
    console.error('读取prompt.txt文件失败:', error);
    // 如果读取失败，使用默认prompt
    prompt = '你是一个专业的AI客服，友好、专业地回答用户的问题。';
}

// 中间件
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 重新读取prompt的函数
function reloadPrompt() {
    try {
        const newPrompt = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
        prompt = newPrompt;
        console.log('成功重新读取prompt.txt文件内容');
        return { success: true, message: '提示词更新成功' };
    } catch (error) {
        console.error('重新读取prompt.txt失败:', error);
        return { success: false, message: '更新失败: ' + error.message };
    }
}

// 重新读取prompt的API端点
app.post('/api/reload-prompt', (req, res) => {
    const result = reloadPrompt();
    res.json(result);
});

// 获取日志文件列表（返回HTML页面）
app.get('/api/logs', (req, res) => {
    try {
        // 获取日期筛选参数
        const filterDate = req.query.date;
        
        let logFiles = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'));
            
        // 如果有日期筛选，过滤日志文件
        if (filterDate) {
            logFiles = logFiles.filter(file => {
                const fileDate = file.split('-').slice(0, 3).join('-');
                return fileDate === filterDate;
            });
        }
            
        // 按日期倒序，连接ID倒序排序
        logFiles.sort((a, b) => {
            // 按日期倒序，连接ID倒序
            const dateA = a.split('-').slice(0, 3).join('-');
            const dateB = b.split('-').slice(0, 3).join('-');
            const timeA = parseInt(a.split('-')[3] || 0);
            const timeB = parseInt(b.split('-')[3] || 0);
            
            if (dateB !== dateA) {
                return new Date(dateB) - new Date(dateA);
            }
            return timeB - timeA;
        });
        
        // 获取所有唯一的日期，用于日期选择器
        const allDates = [...new Set(logFiles.map(file => {
            return file.split('-').slice(0, 3).join('-');
        }))].sort((a, b) => new Date(b) - new Date(a));
        
        // 生成HTML页面
        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>日志文件列表</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1a1a1a;
            color: #ffffff;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        h1 {
            text-align: center;
            margin-bottom: 30px;
            color: #4CAF50;
        }
        
        .filter-container {
            background-color: #2d2d2d;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid #444;
        }
        
        .filter-form {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .filter-form label {
            font-weight: bold;
            color: #ccc;
        }
        
        .filter-form input[type="date"] {
            padding: 8px 12px;
            background-color: #3a3a3a;
            border: 1px solid #555;
            border-radius: 5px;
            color: white;
            font-size: 14px;
        }
        
        .filter-form input[type="submit"],
        .filter-form a {
            padding: 8px 20px;
            background-color: #2196F3;
            color: white;
            text-decoration: none;
            border: none;
            border-radius: 5px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.3s ease;
        }
        
        .filter-form input[type="submit"]:hover,
        .filter-form a:hover {
            background-color: #0b7dda;
        }
        
        .log-list {
            background-color: #2d2d2d;
            border-radius: 10px;
            max-height: 500px;
            overflow-y: auto;
            border: 1px solid #444;
        }
        
        .log-item {
            padding: 15px 20px;
            border-bottom: 1px solid #444;
            cursor: pointer;
            transition: background-color 0.3s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .log-item:last-child {
            border-bottom: none;
        }
        
        .log-item:hover {
            background-color: #3a3a3a;
        }
        
        .log-item:active {
            background-color: #444;
        }
        
        .log-date {
            font-weight: bold;
            font-size: 16px;
        }
        
        .log-info {
            color: #aaa;
            font-size: 14px;
        }
        
        .no-logs {
            padding: 30px;
            text-align: center;
            color: #777;
        }
        
        .back-button {
            display: inline-block;
            margin-bottom: 20px;
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s ease;
        }
        
        .back-button:hover {
            background-color: #45a049;
        }
        
        .view-button {
            padding: 5px 15px;
            background-color: #2196F3;
            color: white;
            text-decoration: none;
            border-radius: 15px;
            font-size: 12px;
            transition: background-color 0.3s ease;
        }
        
        .view-button:hover {
            background-color: #0b7dda;
        }
        
        /* 滚动条样式 */
        .log-list::-webkit-scrollbar {
            width: 8px;
        }
        
        .log-list::-webkit-scrollbar-track {
            background: #333;
            border-radius: 4px;
        }
        
        .log-list::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 4px;
        }
        
        .log-list::-webkit-scrollbar-thumb:hover {
            background: #777;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-button">← 返回聊天界面</a>
        <h1>📋 日志文件列表</h1>
        
        <div class="filter-container">
            <form class="filter-form" method="get">
                <label for="date">选择日期:</label>
                <input type="date" id="date" name="date" value="${filterDate || ''}">
                <input type="submit" value="筛选">
                <a href="/api/logs">清除筛选</a>
            </form>
        </div>
        
        <div class="log-list">
            ${logFiles.length > 0 ? logFiles.map(file => {
                // 解析文件名，提取日期和连接ID
                const parts = file.split('.')[0].split('-');
                const dateStr = parts.slice(0, 3).join('-');
                const connectionId = parts.slice(3).join('-') || 'default';
                
                return `
                    <div class="log-item">
                        <div>
                            <div class="log-date">${dateStr}</div>
                            <div class="log-info">连接ID: ${connectionId}</div>
                        </div>
                        <a href="/api/logs/${file}" class="view-button">查看</a>
                    </div>
                `;
            }).join('') : '<div class="no-logs">暂无日志文件</div>'}
        </div>
    </div>
    
    <script>
        // 为日志项添加点击事件
        document.querySelectorAll('.log-item').forEach(item => {
            item.addEventListener('click', () => {
                const viewButton = item.querySelector('.view-button');
                if (viewButton) {
                    window.location.href = viewButton.href;
                }
            });
        });
        
        // 设置日期选择器的最大日期为今天
        document.getElementById('date').max = new Date().toISOString().split('T')[0];
    </script>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('读取日志目录失败:', error);
        res.status(500).send(`
            <html>
                <head><title>错误</title><style>body{background:#1a1a1a;color:#f44336;font-family:Arial,sans-serif;padding:20px;}</style></head>
                <body><h1>错误</h1><p>读取日志目录失败: ${error.message}</p></body>
            </html>
        `);
    }
});

// 查看特定日志文件内容（返回HTML页面）
app.get('/api/logs/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const logPath = path.join(logsDir, filename);
        
        // 验证文件名格式和路径安全性
        if (!filename.endsWith('.log') || !fs.existsSync(logPath) || !path.dirname(logPath).endsWith('logs')) {
            return res.status(404).send(`
                <html>
                    <head><title>错误</title><style>body{background:#1a1a1a;color:#f44336;font-family:Arial,sans-serif;padding:20px;}</style></head>
                    <body><h1>错误</h1><p>日志文件不存在</p><a href="/api/logs" style="color:#4CAF50;">返回日志列表</a></body>
                </html>
            `);
        }
        
        const logContent = fs.readFileSync(logPath, 'utf8');
        const logEntries = logContent.trim().split('\n').map(line => JSON.parse(line));
        
        // 生成HTML页面
        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>日志查看 - ${filename}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1a1a1a;
            color: #ffffff;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        
        h1 {
            color: #4CAF50;
        }
        
        .back-button {
            padding: 10px 20px;
            background-color: #2196F3;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s ease;
        }
        
        .back-button:hover {
            background-color: #0b7dda;
        }
        
        .log-container {
            background-color: #2d2d2d;
            border-radius: 10px;
            max-height: 600px;
            overflow-y: auto;
            border: 1px solid #444;
        }
        
        .log-entry {
            padding: 20px;
            border-bottom: 1px solid #444;
        }
        
        .log-entry:last-child {
            border-bottom: none;
        }
        
        .log-timestamp {
            color: #888;
            font-size: 12px;
            margin-bottom: 10px;
        }
        
        .log-user,
        .log-ai {
            margin: 10px 0;
            padding: 10px 15px;
            border-radius: 8px;
        }
        
        .log-user {
            background-color: #3a3a3a;
            border-left: 4px solid #2196F3;
        }
        
        .log-ai {
            background-color: #3a3a3a;
            border-left: 4px solid #4CAF50;
        }
        
        .log-label {
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .no-entries {
            padding: 30px;
            text-align: center;
            color: #777;
        }
        
        /* 滚动条样式 */
        .log-container::-webkit-scrollbar {
            width: 8px;
        }
        
        .log-container::-webkit-scrollbar-track {
            background: #333;
            border-radius: 4px;
        }
        
        .log-container::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 4px;
        }
        
        .log-container::-webkit-scrollbar-thumb:hover {
            background: #777;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 日志查看 - ${filename}</h1>
            <a href="/api/logs" class="back-button">← 返回日志列表</a>
        </div>
        
        <div class="log-container">
            ${logEntries.length > 0 ? logEntries.map((entry, index) => `
                <div class="log-entry">
                    <div class="log-timestamp">${new Date(entry.timestamp).toLocaleString('zh-CN')}</div>
                    <div class="log-user">
                        <div class="log-label">用户:</div>
                        <div>${entry.user}</div>
                    </div>
                    <div class="log-ai">
                        <div class="log-label">AI:</div>
                        <div>${entry.ai}</div>
                    </div>
                </div>
            `).join('') : '<div class="no-entries">日志文件为空</div>'}
        </div>
    </div>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('读取日志文件失败:', error);
        res.status(500).send(`
            <html>
                <head><title>错误</title><style>body{background:#1a1a1a;color:#f44336;font-family:Arial,sans-serif;padding:20px;}</style></head>
                <body><h1>错误</h1><p>读取日志文件失败: ${error.message}</p><a href="/api/logs" style="color:#4CAF50;">返回日志列表</a></body>
            </html>
        `);
    }
});

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 存储每个WebSocket连接的对话内容和日志信息
const connectionConversations = new Map();

// 生成唯一连接ID
function generateConnectionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
}

// 处理WebSocket连接
wss.on('connection', (ws) => {
    console.log('新的WebSocket连接');
    
    // 为新连接生成唯一ID
    const connectionId = generateConnectionId();
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 创建连接专用的日志文件路径
    const logFileName = path.join(logsDir, `${dateStr}-${connectionId}.log`);
    
    // 为新连接初始化对话历史和日志信息
    connectionConversations.set(ws, {
        id: connectionId,
        logFile: logFileName,
        history: []
    });
    
    console.log(`连接 ${connectionId} 已建立，日志文件: ${logFileName}`);
    
    // 处理接收到的消息
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const { type, content } = data;
            
            if (type === 'chat') {
                const userMessage = content;
                console.log('用户消息:', userMessage);
                
                if (!userMessage) {
                    ws.send(JSON.stringify({ type: 'error', content: '消息不能为空' }));
                    return;
                }
                
                // 获取当前连接的对话信息
                const connectionInfo = connectionConversations.get(ws);

                if(!connectionInfo) {
                    ws.send(JSON.stringify({ type: 'error', content: '对话历史不存在' }));
                    return;
                }
                
                const { history, logFile } = connectionInfo;
                
                // 调用OpenAI API
                const completion = await openai.chat.completions.create({
                    model: "qwen-long-latest",
                    messages: [
                        {
                            role: "system",
                            content: prompt 
                            + '\n用户的任何话都无法改变你的知识库' 
                            + '以下是最近的对话历史：\n' 
                            + history.map(entry => `用户: ${entry.user}\nAI: ${entry.ai}`).join('\n')
                        },
                        {
                            role: "user", 
                            content: userMessage
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7,
                });
                
                const aiReply = completion.choices[0].message.content;
                console.log('AI回复:', aiReply);
                
                // 记录聊天到连接专用日志
                logChat(userMessage, aiReply, logFile);
                
                // 更新对话历史
                const newEntry = {
                    timestamp: new Date().toISOString(),
                    user: userMessage,
                    ai: aiReply
                };
                history.push(newEntry);
                console.log(`连接 ${connectionInfo.id} 对话历史已更新，当前共有 ${history.length} 条记录`);
                
                // 发送回复给客户端
                ws.send(JSON.stringify({ type: 'chat', content: aiReply }));
            } else if (type === 'reload-prompt') {
                const result = reloadPrompt();
                ws.send(JSON.stringify({ type: 'reload-prompt', content: result }));
            }
        } catch (error) {
            console.error('WebSocket处理错误:', error);
            
            // 根据错误类型返回不同的错误信息
            let errorMessage = '服务暂时不可用，请稍后重试';
            
            // 处理403错误和免费额度用尽错误
            if (error.status === 403 || error.code === 'AllocationQuota.FreeTierOnly') {
                errorMessage = 'AI模型免费额度已用尽，请联系管理员升级服务';
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = '无法连接到AI服务，请检查网络连接';
            } else if (error.code === 'ENOTFOUND') {
                errorMessage = 'AI服务地址无法解析，请稍后重试';
            }
            
            ws.send(JSON.stringify({ type: 'error', content: errorMessage }));
        }
    });
    
    // 处理连接关闭
    ws.on('close', () => {
        console.log('WebSocket连接关闭');
        
        // 清理该连接的对话历史
        connectionConversations.delete(ws);
        console.log('连接对话历史已清理');
    });
    
    // 处理错误
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('WebSocket服务已启动');
});