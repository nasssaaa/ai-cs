const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');
const appRoot = require('app-root-path');
const { getAiResponse, getSliceUrl, getSliceId } = require('./api');
const { readTokensUsageData } = require('./tokensMonitor')
// 确保logs目录存在
const logsDir = path.join(appRoot.path, 'logs');
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
        }
    } catch (error) {
        console.error('写入日志失败:', error);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json());
app.use(express.static(path.join(appRoot.path, 'public')));

// 获取日志文件列表（返回HTML页面）
app.get('/api/admin/logs', (req, res) => {
    try {
        // 获取日期筛选参数
        const filterDate = req.query.date;

        // 读取日志目录下所有日志文件
        let logFiles = fs.readdirSync(path.join(appRoot.path, 'logs'))
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

        // 生成日志项HTML
        const logItems = logFiles.length > 0 ? logFiles.map(file => {
            // 解析文件名，提取日期、时间和连接ID
            const parts = file.split('.')[0].split('-');
            const dateStr = parts.slice(0, 3).join('-');
            const timeStr = parts.slice(3, 6).join(':');
            const connectionId = parts.slice(6).join('-') || 'default';

            return `
                <div class="log-item" data-href="/api/admin/logs/${file}">
                    <div>
                        <div class="log-date">${dateStr}</div>
                        <div class="log-time">${timeStr}</div>
                        <div class="log-info">连接ID: ${connectionId}</div>
                    </div>
                    <span class="nav-arrow">➜</span>
                </div>
            `;
        }).join('') : '<div class="no-logs">暂无日志文件</div>';

        // 读取HTML模板文件
        const htmlTemplate = fs.readFileSync(path.join(appRoot.path, 'html/logs-list.html'), 'utf8');

        // 替换模板变量
        let html = htmlTemplate.replace('{{filterDate}}', filterDate || '');
        html = html.replace('{{logItems}}', logItems);

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
app.get('/api/admin/logs/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const logPath = path.join(appRoot.path, 'logs', filename);

        // 验证文件名格式和路径安全性
        if (!filename.endsWith('.log') || !fs.existsSync(logPath) || !path.dirname(logPath).endsWith('logs')) {
            return res.status(404).send(`
                <html>
                    <head><title>错误</title><style>body{background:#1a1a1a;color:#f44336;font-family:Arial,sans-serif;padding:20px;}</style></head>
                    <body><h1>错误</h1><p>日志文件不存在</p><a href="/api/admin/logs" style="color:#4CAF50;">返回日志列表</a></body>
                </html>
            `);
        }

        // 解析文件名，提取连接ID
        // filename格式: YYYY-MM-DD-HH-mm-ss-connectionId.log
        const parts = filename.split('.')[0].split('-');
        const connectionId = parts.slice(6).join('-') || 'unknown';

        const logContent = fs.readFileSync(logPath, 'utf8');
        const logEntries = logContent.trim().split('\n')
            .map(line => JSON.parse(line))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 按时间戳倒序排序，最新的在最上面

        // 生成日志条目HTML
        const logEntriesHtml = logEntries.length > 0 ? logEntries.map((entry, index) => `
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
        `).join('') : '<div class="no-entries">日志文件为空</div>';

        // 读取HTML模板文件
        const htmlTemplate = fs.readFileSync(path.join(appRoot.path, 'html/log-view.html'), 'utf8');

        // 替换模板变量 - 使用全局替换以替换所有匹配项
        let html = htmlTemplate.replace(/{{filename}}/g, filename);
        html = html.replace(/{{connectionId}}/g, connectionId);
        html = html.replace('{{logEntries}}', logEntriesHtml);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('读取日志文件失败:', error);
        res.status(500).send(`
            <html>
                <head><title>错误</title><style>body{background:#1a1a1a;color:#f44336;font-family:Arial,sans-serif;padding:20px;}</style></head>
                <body><h1>错误</h1><p>读取日志文件失败: ${error.message}</p><a href="/api/admin/logs" style="color:#4CAF50;">返回日志列表</a></body>
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
    const logFileName = path.join(appRoot.path, 'logs', `${dateStr}-${connectionId}.log`);

    // 为新连接初始化对话历史和日志信息
    connectionConversations.set(ws, {
        id: connectionId,
        logFile: logFileName,
        history: [],
        historyFormat: [],
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

                if (!connectionInfo) {
                    ws.send(JSON.stringify({ type: 'error', content: '对话历史不存在' }));
                    return;
                }

                const { history, historyFormat, logFile } = connectionInfo;

                const aiReply = await getAiResponse(userMessage, historyFormat);
                console.log('AI回复:', aiReply);

                // 更新对话历史
                const newEntry = {
                    timestamp: new Date().toISOString(),
                    user: userMessage,
                    ai: aiReply
                };
                history.push(newEntry);
                historyFormat.push({
                    role: 'user',
                    content: userMessage
                })
                historyFormat.push({
                    role: 'assistant',
                    content: aiReply
                })
                console.log(`连接 ${connectionInfo.id} 对话历史已更新，当前共有 ${history.length} 条记录`);

                // 解析火山引擎vikingdb知识库返回的插图标记
                function parseIllustrationTags(text) {
                    // 查找并替换插图标记 <illustration data-ref="..."></illustration>
                    const illustrationRegex = /<illustration[^>]*data-ref\s*=\s*["']([^"']+)["'][^>]*><\/illustration>/gi;
                    let processedText = text;

                    processedText = processedText.replace(illustrationRegex, (match, sliceId) => {
                        // 检查data-ref是否是完整的URL 
                        const result = `<br><img src="/api/download-image/${sliceId}" alt="${sliceId}" class="message-image"><br>`
                        return result;
                    });

                    return processedText;
                }

                async function parseSignTag(text) {
                    if (!text) return text;
                    const signRegex = /<sign>/gi;
                    const sliceId = await getSliceId('售后群');
                    return text.replace(signRegex, `<br><img src="/api/download-image/${sliceId}" alt="${sliceId}" class="message-image"><br>`);
                }

                // 解析AI回复中的插图标记
                const processedReply = await parseSignTag(parseIllustrationTags(aiReply));

                // 记录聊天到连接专用日志
                logChat(userMessage, processedReply, logFile);

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

app.post('/api/get-slice-id', async (req, res) => {
    try {
        const sliceId = await getSliceId(req.body.query);
        res.json({ sliceId });
    } catch (error) {
        console.error('Error getting slice ID:', error);
        res.status(500).json({ error: 'Failed to get slice ID' });
    }
})

// 图片下载路由
app.get('/api/download-image/:sliceid', async (req, res) => {
    try {
        // 获取sliceid路径参数
        const sliceid = req.params.sliceid;

        // 使用getSliceUrl函数获取图片URL
        const imageUrl = await getSliceUrl(sliceid);

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

// 确保data目录存在
const dataDir = path.join(appRoot.path, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// 确保tokens使用量数据文件存在
if (!fs.existsSync(path.join(dataDir, 'tokens-usage.json'))) {
    saveTokensUsageData([]);
    console.log('创建tokens-usage.json文件成功');
}

app.get('/api/tokens-usage', (req, res) => {
    res.send(JSON.stringify(readTokensUsageData()));
})

// tokens使用量监控路由
app.get('/api/admin/tokens-usage-monitor', (req, res) => {
    try {
        // 读取HTML文件
        const html = fs.readFileSync(path.join(appRoot.path, 'html/tokens-usage-monitor.html'), 'utf8');

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {

        console.error('生成监控页面失败:', error);
        res.status(500).json({ error: '生成监控页面失败', message: error.message });
    }
});

app.get('/api/admin', (req, res) => {
    try {
        // 读取HTML文件
        const html = fs.readFileSync(path.join(appRoot.path, 'html/admin.html'), 'utf8');

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('生成管理员页面失败:', error);
        res.status(500).json({ error: '生成管理员页面失败', message: error.message });
    }
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('WebSocket服务已启动');
});