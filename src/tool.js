const qrcode_tool = {
    "type": "function",
    "function": {
        "name": "generate_qrcode",
        "description": "用户应该加售后群或团购群咨询时调用该工具",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "用户应该加什么群？售后群还是团购群"
                }
            },
            "required": ["category"]
        }
    }
}
module.exports = {
    qrcode_tool
}