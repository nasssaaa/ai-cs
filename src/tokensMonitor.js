const fs = require('fs')
const path = require('path')
const appRoot = require('app-root-path')


async function updateTokensUsage(date, tokens) {
    try {
        // 验证数据格式
        if (!date || typeof tokens !== 'number') {
            return res.status(400).json({ error: '无效的数据格式' });
        }

        console.log(`date=${date}, tokens=${tokens}`)

        // 读取现有数据
        const usageData = readTokensUsageData();

        // 查找是否已有该日期的数据
        const index = usageData.findIndex(item => item[0] === date);

        if (index !== -1) {
            // 更新现有数据
            usageData[index][1] += parseFloat(tokens / 1000);
        } else {
            // 添加新数据
            usageData.push([date, parseFloat(tokens / 1000)]);
        }

        // 保存更新后的数据
        const success = saveTokensUsageData(usageData);

        if (!success) {
            console.error('数据保存失败');
        }
    } catch (error) {
        console.error('保存tokens使用量数据失败:', error);
    }
}

const readTokensUsageData = () => {
    try {
        const data = fs.readFileSync(path.join(appRoot.path, 'data/tokens-usage.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取tokens使用量数据失败:', error);
        return [];
    }
}

// 保存tokens使用量数据
const saveTokensUsageData = (data) => {
    try {
        const dataDir = path.join(appRoot.path, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(path.join(dataDir, 'tokens-usage.json'), JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存tokens使用量数据失败:', error);
        return false;
    }
};

module.exports = {
    updateTokensUsage,
    readTokensUsageData,
    saveTokensUsageData
}