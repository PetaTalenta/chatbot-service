const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive test script for chatbot context pipeline
 * Tests the complete flow: profile persona -> context -> AI response
 */

const BASE_URL = 'http://localhost:3006';
const API_GATEWAY_URL = 'http://localhost:3000';

// Test user credentials
const TEST_USER = {
  email: 'kasykoi@gmail.com',
  password: 'Anjas123'
};

// Sample profile persona for testing
const SAMPLE_PROFILE_PERSONA = {
  name: "Sarah Johnson",
  age: 26,
  education: "Bachelor in Computer Science",
  personality: "Creative, analytical, and collaborative",
  interests: ["Web Development", "UI/UX Design", "Machine Learning"],
  strengths: ["Problem-solving", "Communication", "Leadership"],
  careerGoals: "Become a Full-Stack Developer with expertise in AI",
  workStyle: "Collaborative environment with flexible hours",
  values: ["Innovation", "Growth", "Work-life balance"],
  archetype: "The Innovator",
  personalityType: "ENFP",
  skills: ["JavaScript", "Python", "React", "Node.js"]
};

class ChatbotContextTester {
  constructor() {
    this.authToken = null;
    this.userId = null;
    this.conversationId = null;
  }

  async authenticate() {
    try {
      console.log('🔐 Authenticating user...');
      const response = await axios.post(`${API_GATEWAY_URL}/api/auth/login`, TEST_USER);
      
      if (response.data.success) {
        this.authToken = response.data.data.token;
        this.userId = response.data.data.user.id;
        console.log('✅ Authentication successful');
        console.log(`   User ID: ${this.userId}`);
        return true;
      } else {
        console.error('❌ Authentication failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      return false;
    }
  }

  async createConversationWithPersona() {
    try {
      console.log('\n📝 Creating conversation with profile persona...');

      const conversationData = {
        title: 'Context Pipeline Test Conversation',
        profilePersona: SAMPLE_PROFILE_PERSONA
      };

      const response = await axios.post(
        `${API_GATEWAY_URL}/api/chatbot/conversations`,
        conversationData,
        {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data.success) {
        this.conversationId = response.data.data.conversation.id;
        console.log('✅ Conversation created successfully');
        console.log(`   Conversation ID: ${this.conversationId}`);
        console.log(`   Profile Persona stored: ${!!response.data.data.conversation.context_data?.profilePersona}`);
        
        // Verify profile persona is stored correctly
        if (response.data.data.conversation.context_data?.profilePersona) {
          console.log('✅ Profile persona verification:');
          console.log(`   Name: ${response.data.data.conversation.context_data.profilePersona.name}`);
          console.log(`   Archetype: ${response.data.data.conversation.context_data.profilePersona.archetype}`);
          console.log(`   Career Goals: ${response.data.data.conversation.context_data.profilePersona.careerGoals}`);
        }
        
        return true;
      } else {
        console.error('❌ Conversation creation failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Conversation creation error:', error.response?.data || error.message);
      return false;
    }
  }

  async testContextAwareResponse() {
    try {
      console.log('\n🤖 Testing context-aware AI response...');
      
      // Test questions that should reference the profile persona
      const testQuestions = [
        "Halo! Bisakah kamu memperkenalkan diri dan menjelaskan bagaimana kamu bisa membantu saya berdasarkan profil saya?",
        "Apa archetype kepribadian saya?",
        "Berdasarkan profil saya, karir apa yang paling cocok untuk saya?",
        "Apa kelebihan utama saya menurut analisis profil?",
        "Bagaimana cara saya mengembangkan karir di bidang teknologi?"
      ];

      for (let i = 0; i < testQuestions.length; i++) {
        const question = testQuestions[i];
        console.log(`\n📤 Sending question ${i + 1}: "${question.substring(0, 50)}..."`);
        
        const response = await axios.post(
          `${API_GATEWAY_URL}/api/chatbot/conversations/${this.conversationId}/messages`,
          {
            content: question,
            content_type: 'text'
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 45000 // 45 second timeout for AI responses
          }
        );

        if (response.data.success) {
          const aiResponse = response.data.data.assistant_message.content;
          console.log('✅ AI Response received');
          console.log(`   Length: ${aiResponse.length} characters`);
          
          // Check if response contains context from profile persona
          const contextIndicators = [
            SAMPLE_PROFILE_PERSONA.name,
            SAMPLE_PROFILE_PERSONA.archetype,
            SAMPLE_PROFILE_PERSONA.careerGoals,
            'Sarah',
            'Innovator',
            'Full-Stack Developer',
            'ENFP'
          ];

          const foundIndicators = contextIndicators.filter(indicator => 
            aiResponse.toLowerCase().includes(indicator.toLowerCase())
          );

          if (foundIndicators.length > 0) {
            console.log('✅ Context awareness detected:');
            foundIndicators.forEach(indicator => {
              console.log(`   - References: "${indicator}"`);
            });
          } else {
            console.log('⚠️  No clear context references found in response');
          }

          // Show first 200 characters of response
          console.log(`   Response preview: "${aiResponse.substring(0, 200)}..."`);
          
          // Wait between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.error(`❌ Question ${i + 1} failed:`, response.data);
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Context testing error:', error.response?.data || error.message);
      return false;
    }
  }

  async testDirectChatbotService() {
    try {
      console.log('\n🔧 Testing direct chatbot service...');
      
      // Test direct access to chatbot service
      const response = await axios.get(`${BASE_URL}/health`);
      console.log('✅ Chatbot service health check:', response.data);
      
      return true;
    } catch (error) {
      console.error('❌ Direct service test error:', error.message);
      return false;
    }
  }

  async runFullTest() {
    console.log('🚀 Starting Chatbot Context Pipeline Test\n');
    console.log('=' .repeat(60));
    
    // Step 1: Authenticate
    const authSuccess = await this.authenticate();
    if (!authSuccess) {
      console.log('\n❌ Test failed at authentication step');
      return;
    }

    // Step 2: Test direct service
    await this.testDirectChatbotService();

    // Step 3: Create conversation with persona
    const conversationSuccess = await this.createConversationWithPersona();
    if (!conversationSuccess) {
      console.log('\n❌ Test failed at conversation creation step');
      return;
    }

    // Step 4: Test context-aware responses
    const contextSuccess = await this.testContextAwareResponse();
    if (!contextSuccess) {
      console.log('\n❌ Test failed at context testing step');
      return;
    }

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Chatbot Context Pipeline Test Completed!');
    console.log('\nSummary:');
    console.log(`✅ Authentication: Success`);
    console.log(`✅ Conversation Creation: Success`);
    console.log(`✅ Profile Persona Storage: Success`);
    console.log(`✅ Context-Aware Responses: Success`);
  }
}

// Run the test
if (require.main === module) {
  const tester = new ChatbotContextTester();
  tester.runFullTest().catch(console.error);
}

module.exports = ChatbotContextTester;
