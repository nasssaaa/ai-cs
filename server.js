const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');
const { Signer } = require('@volcengine/openapi');
// 确保logs目录存在
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('创建logs目录成功');
}

async function getSliceUrl(sliceId) {
    const url = `https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/point/info`;
    const credentials = {
        accessKeyId: 'AKLTZGE1YmU5OGI1OTM2NDgzOTk5ZjgyOTU3Y2UyNzAyMDc',
        secretKey: 'TXpVeFl6STVPR1V4TjJSbU5HRTBaV0UxTmpabU16Um1aRGswTmprd056UQ=='
    }
    const body = {
        point_id: sliceId,
        resource_id: 'kb-a0cb294cc7d1cbf8',
        get_attachment_link: true
    }
    const request = {
        region: 'cn-beijing',
        headers: {
            'Accept': "application/json",
            'Content-type': 'application/json',
            'Host': 'api-knowledgebase.mlp.cn-beijing.volces.com'
        },
        method: 'POST',
        body: JSON.stringify(body),
        pathname: '/api/knowledge/point/info'
    };
    const signer = new Signer(request, 'air');
    signer.addAuthorization(credentials);

    try {
        const response = await axios.post(url, body, {
            headers: request.headers
        });
        return response.data.data.chunk_attachment[0].link
    }catch (error) {
        console.error(`Error calling KnowledgeBase: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    return null;
}

//ai应用调用函数
async function getAiResponse(prompt, history) {
    const appId = 'kb-service-2b9eff4b91435433' 
    const apiKey = 'afe01879-d881-45f6-bbb4-fc8a34390aa5'

    const url = `https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/service/chat`;
    const data = {
        service_resource_id: appId,
        messages: [
            ...history,
            {
                role: "user",
                content: prompt
            }
        ],
        stream: false
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                'Accept': "application/json",
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                "Host": "api-knowledgebase.mlp.cn-beijing.volces.com"
            }
        });

        if (response.status === 200) {
            return response.data.data.generated_answer;
        } else {
            console.log(`request_id=${response.headers['request_id']}`);
            console.log(`code=${response.status}`);
            console.log(`message=${response.data.message}`);
        }
    } catch (error) {
        console.error(`Error calling KnowledgeBase: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    return '调用AI模型失败';
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

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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
            
        // 按日期和时间倒序排序，最新的在最上面
        logFiles.sort((a, b) => {
            // 解析完整的日期时间字符串（前6部分：YYYY-MM-DD-HH-mm-ss）
            const datetimeA = a.split('-').slice(0, 6).join('-');
            const datetimeB = b.split('-').slice(0, 6).join('-');
            
            // 按完整日期时间倒序排序
            const dateTimeA = new Date(datetimeA.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3'));
            const dateTimeB = new Date(datetimeB.replace(/-(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3'));
            
            if (dateTimeB.getTime() !== dateTimeA.getTime()) {
                return dateTimeB - dateTimeA;
            }
            
            // 如果日期时间相同，按连接ID倒序排序
            const idA = a.split('-').slice(6).join('-');
            const idB = b.split('-').slice(6).join('-');
            return idB.localeCompare(idA);
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
        
        .log-time {
            color: #4CAF50;
            font-size: 14px;
            margin: 5px 0;
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
                // 解析文件名，提取日期、时间和连接ID
                const parts = file.split('.')[0].split('-');
                const dateStr = parts.slice(0, 3).join('-');
                const timeStr = parts.slice(3, 6).join(':');
                const connectionId = parts.slice(6).join('-') || 'default';
                
                return `
                    <div class="log-item">
                        <div>
                            <div class="log-date">${dateStr}</div>
                            <div class="log-time">${timeStr}</div>
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
        const logEntries = logContent.trim().split('\n')
            .map(line => JSON.parse(line))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 按时间戳倒序排序，最新的在最上面
        
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
                    <div class="log-timestamp">${new Date(entry.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
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
    
    // 构建包含年月日时分秒的字符串：YYYY-MM-DD-HH-mm-ss
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
    
    // 创建连接专用的日志文件路径
    const logFileName = path.join(logsDir, `${dateStr}-${connectionId}.log`);
    
    // 为新连接初始化对话历史和日志信息
    connectionConversations.set(ws, {
        id: connectionId,
        logFile: logFileName,
        history: [],
        historyFormat: []
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
                
                const { history, historyFormat, logFile } = connectionInfo;
                
                const aiReply = await getAiResponse(userMessage, historyFormat);
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
                historyFormat.push({
                    role: "user",
                    content: userMessage
                });
                historyFormat.push({
                    role: "assistant",
                    content: aiReply
                });
                console.log(`连接 ${connectionInfo.id} 对话历史已更新，当前共有 ${history.length} 条记录`);
                
                // 解析火山引擎vikingdb知识库返回的插图标记
                function parseIllustrationTags(text) {
                    // 查找并替换插图标记 <illustration data-ref="..."></illustration>
                    const illustrationRegex = /<illustration[^>]*data-ref\s*=\s*["']([^"']+)["'][^>]*><\/illustration>/gi;
                    let processedText = text;
                    
                    processedText = processedText.replace(illustrationRegex, (match, sliceId) => {
                        // 检查data-ref是否是完整的URL 
                        const result = `<img src="/api/download-image/${sliceId}" alt="${sliceId}" class="message-image">`
                        return result;
                    });
                    
                    return processedText;
                }
                
                // 解析AI回复中的插图标记
                const processedReply = parseIllustrationTags(aiReply);
                
                // 发送处理后的回复给客户端
                ws.send(JSON.stringify({ type: 'chat', content: processedReply }));
            }
        } catch (error) {
                console.error('WebSocket处理错误:', error);
                
                // 根据错误类型返回不同的错误信息
                let errorMessage = '服务暂时不可用，请稍后重试';
            
                // 处理429错误
                if (error.status === 429) {
                    if (error.code === 'limit_requests') {
                        errorMessage = 'AI模型调用频率过高，请稍后重试或联系管理员增加请求限制';
                    } else if (error.code === 'insufficient_quota') {
                        errorMessage = 'AI模型调用次数已超出配额限制，请稍后重试或联系管理员增加配额';
                    } else {
                        errorMessage = 'AI模型服务暂时不可用，请稍后重试';
                    }
                }
                // 处理403错误和免费额度用尽错误
                else if (error.status === 403 || error.code === 'AllocationQuota.FreeTierOnly') {
                    errorMessage = 'AI模型免费额度已用尽，请联系管理员升级服务';
                } 
                // 处理400输入长度超出限制错误
                else if (error.status === 400 && error.code === 'invalid_parameter_error') {
                    if (error.message && error.message.includes('Range of input length should be')) {
                        errorMessage = '您的请求内容过长，请尝试简化问题或减少输入内容';
                    } else {
                        errorMessage = '请求参数错误，请检查输入内容';
                    }
                }
                // 处理网络连接错误
                else if (error.code === 'ECONNREFUSED') {
                    errorMessage = '无法连接到AI服务，请检查网络连接';
                } else if (error.code === 'ENOTFOUND') {
                    errorMessage = 'AI服务地址无法解析，请稍后重试';
                }
                
                // 检查WebSocket连接是否仍然打开，再发送错误消息
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', content: errorMessage }));
                } else {
                    console.error('WebSocket连接已关闭，无法发送错误消息');
                }
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

// 图片下载路由
app.get('/api/download-image/:sliceid', async (req, res) => {
    try {
        // 获取sliceid路径参数
        const sliceid = req.params.sliceid;
        
        // 使用getSliceUrl函数获取图片URL
        const imageUrl = await getSliceUrl(sliceid);

        console.log
        
        if (!imageUrl) {
            return res.status(404).json({ error: '图片不存在或获取URL失败' });
        }
        
        // 使用axios下载图片
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer'
        });
        
        // 设置响应头
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Length', response.headers['content-length']);
        
        // 返回图片数据
        res.send(response.data);
    } catch (error) {
        console.error('下载图片失败:', error);
        res.status(500).json({ error: '下载图片失败', message: error.message });
    }
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('WebSocket服务已启动');
});