const { updateTokensUsage } = require('./tokensMonitor')
const { Signer } = require('@volcengine/openapi');
const axios = require('axios')

const resource_id = 'kb-a0cb294cc7d1cbf8'

async function getSliceId(query) {
    const url = `https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/collection/search_knowledge`;
    const credentials = {
        accessKeyId: 'AKLTZGE1YmU5OGI1OTM2NDgzOTk5ZjgyOTU3Y2UyNzAyMDc',
        secretKey: 'TXpVeFl6STVPR1V4TjJSbU5HRTBaV0UxTmpabU16Um1aRGswTmprd056UQ=='
    }
    const body = {
        query: query,
        resource_id: resource_id
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
        pathname: '/api/knowledge/collection/search_knowledge'
    };
    const signer = new Signer(request, 'air');
    signer.addAuthorization(credentials);

    try {
        const response = await axios.post(url, body, {
            headers: request.headers
        });
        return response.data.data.result_list[0].point_id
    } catch (error) {
        console.error(`Error calling KnowledgeBase: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    return null;
}

async function getSliceUrl(sliceId) {
    const url = `https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/point/info`;
    const credentials = {
        accessKeyId: 'AKLTZGE1YmU5OGI1OTM2NDgzOTk5ZjgyOTU3Y2UyNzAyMDc',
        secretKey: 'TXpVeFl6STVPR1V4TjJSbU5HRTBaV0UxTmpabU16Um1aRGswTmprd056UQ=='
    }
    const body = {
        point_id: sliceId,
        resource_id: resource_id,
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
    } catch (error) {
        console.error(`Error calling KnowledgeBase: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
    return null;
}

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
    getAiResponse,
    getSliceUrl,
    getSliceId
}