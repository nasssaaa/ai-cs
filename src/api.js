const { updateTokensUsage } = require('./tokensMonitor')
const axios = require('axios')

async function getAiResponse(prompt, history) {
    const appId = 'kb-service-b8f399a50972b8a'
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
            const data = response.data
            const tokens = data.data.token_usage.llm_token_usage.total_tokens
            updateTokensUsage(new Date().toISOString().split('T')[0], tokens)
            return data.data.generated_answer;
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

module.exports = {
    getAiResponse
}