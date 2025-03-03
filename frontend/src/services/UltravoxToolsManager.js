import ServiceConnectionManager from './ServiceConnectionManager';

class UltravoxToolsManager {
  constructor() {
    // Define all available tools with their configurations
    this.tools = {
      'calendar': {
        name: 'Google Calendar',
        modelToolName: 'calendarTool',
        variableName: 'GOOGLE_CALENDAR_ENABLED',
        description: 'Schedule and manage meetings using Google Calendar',
        dynamicParameters: [
          {
            name: 'meetingDetails',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Meeting title' },
                description: { type: 'string', description: 'Meeting description' },
                startTime: { type: 'string', description: 'Start time in ISO format' },
                endTime: { type: 'string', description: 'End time in ISO format' },
                attendees: { type: 'array', items: { type: 'string' } }
              }
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/calendar/create',
          httpMethod: 'POST'
        }
      },
      'gmail': {
        name: 'Gmail',
        modelToolName: 'gmailTool',
        variableName: 'GMAIL_ENABLED',
        description: 'Send and manage emails through Gmail',
        dynamicParameters: [
          {
            name: 'emailDetails',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: 'Recipient email' },
                subject: { type: 'string', description: 'Email subject' },
                body: { type: 'string', description: 'Email content' },
                attachments: { type: 'array', items: { type: 'string' } }
              }
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/gmail/send',
          httpMethod: 'POST'
        }
      },
      'drive': {
        name: 'Google Drive',
        modelToolName: 'driveSearchTool',
        variableName: 'GOOGLE_DRIVE_ENABLED',
        description: 'Search and access documents in Google Drive',
        dynamicParameters: [
          {
            name: 'searchQuery',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'string',
              description: 'Search query for documents'
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/drive/search',
          httpMethod: 'GET'
        }
      },
      'vectorize': {
        name: 'Document Vectorization',
        modelToolName: 'vectorizeDocument',
        variableName: 'VECTORIZATION_ENABLED',
        description: 'Vectorize documents from Google Drive and store in Supabase',
        dynamicParameters: [
          {
            name: 'documentId',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'string',
              description: 'Google Drive document ID'
            },
            required: true
          },
          {
            name: 'supabaseTable',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'string',
              description: 'Supabase table for vector storage'
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/vectorize',
          httpMethod: 'POST'
        }
      },
      'serp': {
        name: 'Browse Internet',
        modelToolName: 'serpTool',
        variableName: 'SERP_ENABLED',
        description: 'Browse the internet to get information',
        dynamicParameters: [
          {
            name: 'searchQuery',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'string',
              description: 'Search query for browsing the internet'
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/serp/search',
          httpMethod: 'GET'
        }
      },
      'weather': {
        name: 'Get Weather',
        modelToolName: 'weatherTool',
        variableName: 'WEATHER_ENABLED',
        description: 'Get the current weather conditions for a given location',
        dynamicParameters: [
          {
            name: 'location',
            location: 'PARAMETER_LOCATION_BODY',
            schema: {
              type: 'string',
              description: 'The city and state to get weather information for'
            },
            required: true
          }
        ],
        http: {
          baseUrlPattern: '/api/weather/current',
          httpMethod: 'GET'
        }
      },
      'endCall': {
        name: 'End Call',
        modelToolName: 'endCall',
        description: 'Terminate the current call and perform cleanup',
        dynamicParameters: [],
        client: {}
      }
    };
  }

  generateSystemPrompt(enabledTools, customInstructions = '') {
    // Start with base prompt
    let basePrompt = `You are an AI assistant for an agency specializing in website creation and digital marketing. Your goal is to assist potential clients, understand their needs, and guide them through our service offerings. You have access to various tools. Use them appropriately to help users. `;
    
    // Add enabled tools variables
    const variables = enabledTools.map(toolId => {
      const tool = this.tools[toolId];
      return tool?.variableName ? `${tool.variableName}=true` : null;
    }).filter(Boolean);

    // Add disabled tools variables
    const disabledTools = Object.keys(this.tools)
      .filter(toolId => !enabledTools.includes(toolId) && toolId !== 'endCall')
      .map(toolId => {
        const tool = this.tools[toolId];
        return tool?.variableName ? `${tool.variableName}=false` : null;
      }).filter(Boolean);

    // Combine variables
    const allVariables = [...variables, ...disabledTools].join(', ');
    
    // Add tool descriptions for enabled tools
    if (enabledTools.length > 0) {
      basePrompt += `\n\nAvailable tools:\n`;
      enabledTools.forEach(toolId => {
        const tool = this.tools[toolId];
        if (tool) {
          basePrompt += `- ${tool.name}: ${tool.description}\n`;
        }
      });
    }

    // Add client information if available
    const clientInfo = ServiceConnectionManager.getCredentials('ClientInfo');
    if (clientInfo) {
      basePrompt += `\n\nYou are currently speaking with ${clientInfo.name || 'a client'}.`;
      if (clientInfo.address) {
        basePrompt += ` Their address is: ${clientInfo.address}.`;
      }
      if (clientInfo.email) {
        basePrompt += ` Their email is: ${clientInfo.email}.`;
      }
    }

    // Additional instructions (converted from comments):
    // If the client's name or address is not known, attempt to extract it from the conversation and store it for future calls.
    // If the client asks about the weather, use the weather tool to get the current weather conditions for their location.
    // If the client asks about our services, use the browse internet tool to get the latest information from our website.
    // If the client is interested in scheduling a meeting, use the schedule_meeting tool to schedule a meeting with them.
    // If the client asks to send an email, use the gmail tool to send an email with the conversation summary.
    // If the client is angry or upset, offer to escalate the call to a manager.
    // If the client is not interested in our services, politely end the call.
    // If the client is ready to proceed, guide them through the next steps.
    // If the client asks a question, use the question_and_answer tool to answer their question.
    // If the client asks to record the call, inform them that the call is already being recorded.
    // If the client asks about the call duration, provide them with the call duration.
    // If the client asks who hung up the call, inform them who hung up the call.
    // If the client asks for a transcription of the call, provide them with a transcription of the call.
    // If the client asks about the call stats, provide them with the call stats from Twilio.
    // If the client asks about the appointment scheduled from Google Calendar, provide them with the appointment details.
    // If the client asks about the email event, provide them with the email event details.

    // Add variables to prompt
    basePrompt += `\n\nService Status: ${allVariables}`;

    // Add custom instructions if provided
    if (customInstructions) {
      basePrompt += `\n\nAdditional Instructions:\n${customInstructions}`;
    }

    return basePrompt;
  }

  generateToolsConfig(enabledTools) {
    // Always include endCall tool
    const tools = [...enabledTools, 'endCall'];
    
    return tools.map(toolId => {
      const tool = this.tools[toolId];
      if (!tool) return null;
      return {
        temporaryTool: {
          modelToolName: tool.modelToolName,
          description: tool.description,
          dynamicParameters: tool.dynamicParameters,
          ...(tool.http ? { http: tool.http } : {}),
          ...(tool.client ? { client: tool.client } : {})
        }
      };
    }).filter(Boolean);
  }

  getUltravoxConfig(enabledTools, customInstructions = '', voice = null) {
    const ultravoxCredentials = ServiceConnectionManager.getCredentials('Ultravox');
    const systemPrompt = this.generateSystemPrompt(enabledTools, customInstructions);
    const voiceName = voice || (ultravoxCredentials && ultravoxCredentials.voice) || this.voice;
    return {
      systemPrompt: systemPrompt,
      selectedTools: this.generateToolsConfig(enabledTools),
      voice: voiceName
    };
  }

  validateToolConfiguration(toolId, credentials) {
    const tool = this.tools[toolId];
    if (!tool) return false;
    // Add specific validation logic for each tool
    switch (toolId) {
      case 'calendar':
      case 'gmail':
        return credentials.apiKey && credentials.clientId;
      case 'drive':
        return credentials.apiKey && credentials.clientId;
      case 'vectorize':
        return credentials.supabaseTable;
      default:
        return true;
    }
  }
}

export default new UltravoxToolsManager();
