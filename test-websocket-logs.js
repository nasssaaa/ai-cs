const WebSocket = require('ws');

// 创建两个WebSocket连接来测试日志功能
function createConnection(id) {
    console.log(`创建连接 ${id}...`);
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.on('open', () => {
        console.log(`连接 ${id} 已打开`);
        // 发送测试消息
        const testMessage = `这是连接 ${id} 的测试消息`;
        ws.send(JSON.stringify({ type: 'chat', content: testMessage }));
    });
    
    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            if (response.type === 'chat') {
                console.log(`连接 ${id} 收到回复: ${response.content.substring(0, 50)}...`);
                // 关闭连接
                ws.close();
            }
        } catch (error) {
            console.error(`连接 ${id} 解析消息错误:`, error);
        }
    });
    
    ws.on('close', () => {
        console.log(`连接 ${id} 已关闭`);
    });
    
    ws.on('error', (error) => {
        console.error(`连接 ${id} 错误:`, error);
    });
}

// 创建第一个连接
createConnection(1);

// 延迟1秒后创建第二个连接，确保日志文件名不同
setTimeout(() => {
    createConnection(2);
}, 1000);