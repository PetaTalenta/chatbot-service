# Chatbot Service - System Instructions Implementation

## Overview
Implementasi ini memastikan bahwa model AI dalam chatbot service hanya berperan sebagai **Guider** (pemandu) dan tidak melakukan analisis ulang terhadap profile persona pengguna.

## Key Features

### 1. System Instructions yang Jelas
- Model diberi instruksi tegas bahwa tugasnya HANYA sebagai pemandu
- Profile persona (RIASEC, OCEAN, VIAIS) sudah final dan tidak perlu dianalisis ulang
- Pembatasan yang jelas tentang apa yang TIDAK boleh dilakukan

### 2. Multi-Layer Protection
- **System Prompt**: Instruksi utama di setiap conversation dengan proteksi data
- **Reinforcement Instructions**: Pengingat tambahan di setiap context building
- **Response Validation**: Validasi otomatis untuk mencegah role deviation
- **Data Access Protection**: Proteksi khusus untuk mencegah akses tidak sah ke data
- **Security Logging**: Logging otomatis untuk semua percobaan akses data

### 3. Prohibited Patterns Detection
Model dilarang menggunakan pola-pola berikut:

**Role Deviation Patterns:**
- Mari kita analisis...
- Saya perlu mengetahui...
- Bisakah ceritakan tentang...
- Untuk analisis lebih...
- Jawab pertanyaan berikut...
- Tes kepribadian...
- Assessment tambahan...

**Prompt Injection Patterns:**
- Lupakan instruksi...
- Abaikan instruksi...
- Berperan sebagai...
- Resep masakan...
- Sekarang kamu adalah...

**Data Access Patterns (HIGH PRIORITY):**
- Kirim data...
- Export data...
- Download data...
- Akses database...
- Tampilkan semua data...
- Bagikan informasi...
- Transfer data...

## File Changes

### 1. `/src/config/systemPrompts.js` (NEW)
Konfigurasi terpusat untuk semua system prompts dan prohibited patterns.

### 2. `/src/services/contextService.js`
- Updated system prompt untuk career guidance
- Menambahkan reinforcement instructions di setiap context building
- Menggunakan konfigurasi terpusat

### 3. `/src/controllers/conversationController.js`
- System instruction yang lebih kuat saat inisialisasi conversation
- Menggunakan SYSTEM_PROMPTS.INITIAL_CONVERSATION
- Profile persona context yang jelas

### 4. `/src/controllers/messageController.js`
- Menambahkan response validation
- Fallback response jika terdeteksi role deviation
- Metadata tracking untuk validation results

## How It Works

### Initial Conversation Flow
1. User membuat conversation dengan `profilePersona` data
2. System menggunakan `INITIAL_CONVERSATION` prompt yang jelas
3. Profile persona diinjeksi sebagai context (sudah final)
4. Model memberikan response pengenalan berdasarkan data yang ada

### Message Flow
1. User mengirim message
2. Context service membangun conversation history dengan:
   - Main system prompt (`CAREER_GUIDER`)
   - Reinforcement instructions (`ROLE_REINFORCEMENT`)
   - Conversation history
3. AI menghasilkan response
4. Response divalidasi untuk prohibited patterns
5. Jika terdeteksi role deviation, gunakan `FALLBACK_RESPONSE`
6. Response disimpan dengan metadata validation

### Response Validation
```javascript
// Data access request detection (highest priority)
const hasDataAccessRequest = dataAccessPatterns.some(pattern => 
  pattern.test(userInput)
);

if (hasDataAccessRequest) {
  logger.warn('Data access request detected - SECURITY ALERT', {
    severity: 'HIGH'
  });
  return SYSTEM_PROMPTS.DATA_ACCESS_DENIAL_RESPONSE;
}

// Prompt injection detection
const hasPromptInjection = promptInjectionPatterns.some(pattern => 
  pattern.test(userInput)
);

if (hasPromptInjection) {
  return SYSTEM_PROMPTS.PROMPT_INJECTION_RESPONSE;
}

// General prohibited patterns
const hasProhibitedContent = PROHIBITED_PATTERNS.some(pattern => 
  pattern.test(response)
);

if (hasProhibitedContent) {
  return SYSTEM_PROMPTS.FALLBACK_RESPONSE;
}
```

## Key Messages to Model

### Primary Role Definition
> "Kamu adalah Guider, seorang pemandu karir yang membantu pengguna memahami profile persona mereka yang sudah dianalisis sebelumnya."

### Core Restrictions
- **JANGAN** melakukan analisis ulang
- **JANGAN** meminta data tambahan
- **JANGAN** membuat interpretasi baru
- **FOKUS** hanya pada penjelasan data yang sudah ada

### Expected Behavior
Model seharusnya:
- Menjelaskan hasil RIASEC, OCEAN, VIAIS yang sudah ada
- Memberikan panduan karir berdasarkan profile persona
- Menjawab pertanyaan tentang karakteristik yang sudah dianalisis
- Menggunakan bahasa Indonesia yang mudah dipahami
- **MENOLAK** semua permintaan akses data dengan alasan keamanan dan privasi

## Data Protection Features

### Automatic Data Access Denial
Ketika user meminta:
- "Kirim data saya"
- "Export database"
- "Akses sistem backend"
- "Download informasi"

Model akan otomatis merespon dengan `DATA_ACCESS_DENIAL_RESPONSE` yang menjelaskan:
- Mengapa permintaan ditolak (untuk perlindungan data)
- Bahwa Guider tidak memiliki akses ke sistem backend
- Alternatif bantuan yang bisa diberikan (penjelasan verbal)

### Security Logging
Semua percobaan akses data dicatat dengan level `ERROR` dan tag `SECURITY ALERT` mengandung:
- IP address user
- Conversation ID dan User ID
- Pattern yang terdeteksi
- Timestamp lengkap
- Severity level: HIGH

## Testing Recommendations

1. **Test Role Adherence**: Coba pertanyaan yang bisa memancing model untuk analisis ulang
2. **Test Prohibited Patterns**: Pastikan response validation bekerja
3. **Test Profile Persona Context**: Verifikasi model menggunakan data yang disediakan
4. **Test Fallback Response**: Pastikan fallback response muncul saat role deviation

## Monitoring

- Log semua prohibited pattern detections
- Track response validation results dalam message metadata
- Monitor conversation quality untuk memastikan user experience tetap baik

## Environment Variables
Tidak ada environment variable baru yang diperlukan. Semua konfigurasi ada di `systemPrompts.js`.
