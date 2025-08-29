// Blackjack Oyun Durumları
const GameState = {
    BETTING: 'betting',
    DEALING: 'dealing',
    PLAYER_TURN: 'player_turn',
    BOTS_TURN: 'bots_turn',
    DEALER_TURN: 'dealer_turn',
    SETTLE: 'settle',
    REVEAL: 'reveal'
};

// Kart türleri ve değerleri
const SUITS = {
    S: '♠', // Spades - Maça
    H: '♥', // Hearts - Kupa  
    D: '♦', // Diamonds - Karo
    C: '♣'  // Clubs - Sinek
};

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Ana oyun sınıfı
class BlackjackGame {
    constructor() {
        this.state = GameState.BETTING;
        this.deck = [];
        this.originalDeckOrder = [];
        this.handHash = '';
        this.seed = null;
        this.balance = parseInt(localStorage.getItem('blackjack-balance')) || 1000;
        this.currentBet = 25;
        
        // Oyuncu elleri
        this.hands = {
            player: [],
            bot2: [],
            bot3: [],
            dealer: []
        };
        
        // Oyuncu durumları
        this.playerStates = {
            player: 'active',
            bot2: 'waiting',
            bot3: 'waiting',
            dealer: 'waiting'
        };
        
        this.currentPlayer = 'player';
        this.canDouble = false;
        
        this.initializeUI();
        this.updateBalance();
        this.addEventListeners();
    }
    
    // UI başlatma
    initializeUI() {
        this.elements = {
            handHash: document.getElementById('hand-hash'),
            seedInput: document.getElementById('seed-input'),
            newHandBtn: document.getElementById('new-hand'),
            copyHashBtn: document.getElementById('copy-hash'),
            balanceDisplay: document.getElementById('balance'),
            betInput: document.getElementById('bet-input'),
            hitBtn: document.getElementById('hit-btn'),
            standBtn: document.getElementById('stand-btn'),
            doubleBtn: document.getElementById('double-btn'),
            gameLog: document.getElementById('game-log'),
            revealModal: document.getElementById('reveal-modal'),
            deckOrder: document.getElementById('deck-order'),
            verifyBtn: document.getElementById('verify-btn'),
            closeModal: document.getElementById('close-modal'),
            verificationResult: document.getElementById('verification-result')
        };
        
        this.cardContainers = {
            player: document.getElementById('player-cards'),
            bot2: document.getElementById('bot2-cards'),
            bot3: document.getElementById('bot3-cards'),
            dealer: document.getElementById('dealer-cards')
        };
        
        this.totalDisplays = {
            player: document.getElementById('player-total'),
            bot2: document.getElementById('bot2-total'),
            bot3: document.getElementById('bot3-total'),
            dealer: document.getElementById('dealer-total')
        };
    }
    
    // Event listener'ları ekleme
    addEventListeners() {
        // Ana oyun kontrolleri
        this.elements.newHandBtn.addEventListener('click', () => this.startNewHand());
        this.elements.hitBtn.addEventListener('click', () => this.hit());
        this.elements.standBtn.addEventListener('click', () => this.stand());
        this.elements.doubleBtn.addEventListener('click', () => this.double());
        
        // Hızlı bahis butonları
        document.querySelectorAll('[data-bet]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.elements.betInput.value = e.target.dataset.bet;
            });
        });
        
        // Hash kopyalama
        this.elements.copyHashBtn.addEventListener('click', () => this.copyHash());
        
        // Modal kontrolleri
        this.elements.verifyBtn.addEventListener('click', () => this.verifyDeck());
        this.elements.closeModal.addEventListener('click', () => this.closeModal());
        
        // Klavye desteği
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Bahis input validasyonu
        this.elements.betInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (value > this.balance) {
                e.target.value = this.balance;
            }
        });
    }
    
    // Klavye desteği
    handleKeyboard(e) {
        if (this.state !== GameState.PLAYER_TURN || this.currentPlayer !== 'player') return;
        
        switch(e.key.toLowerCase()) {
            case 'h':
                if (!this.elements.hitBtn.disabled) this.hit();
                break;
            case 's':
                if (!this.elements.standBtn.disabled) this.stand();
                break;
            case 'd':
                if (!this.elements.doubleBtn.disabled) this.double();
                break;
            case 'n':
                if (this.state === GameState.BETTING) this.startNewHand();
                break;
        }
    }
    
    // Seeded Random Number Generator (tohum ile rastgelelik)
    createSeededRandom(seed) {
        let seedValue = 0;
        if (seed) {
            for (let i = 0; i < seed.length; i++) {
                seedValue = ((seedValue << 5) - seedValue + seed.charCodeAt(i)) & 0xffffffff;
            }
        } else {
            seedValue = Math.floor(Math.random() * 0xffffffff);
        }
        
        return function() {
            seedValue = (seedValue * 9301 + 49297) % 233280;
            return seedValue / 233280;
        };
    }
    
    // Deste oluşturma
    createDeck() {
        const deck = [];
        let cardId = 0;
        
        for (const suit of Object.keys(SUITS)) {
            for (const rank of RANKS) {
                deck.push({
                    id: cardId++,
                    suit: suit,
                    rank: rank,
                    value: this.getCardValue(rank)
                });
            }
        }
        
        return deck;
    }
    
    // Kart değeri hesaplama
    getCardValue(rank) {
        if (['J', 'Q', 'K'].includes(rank)) return 10;
        if (rank === 'A') return 11; // As başlangıçta 11, gerektiğinde 1 olur
        return parseInt(rank);
    }
    
    // Fisher-Yates shuffle algoritması
    shuffleDeck(deck, randomFunc) {
        const shuffled = [...deck];
        
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(randomFunc() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        return shuffled;
    }
    
    // SHA-256 hash oluşturma
    async createHash(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Yeni el başlatma
    async startNewHand() {
        const bet = parseInt(this.elements.betInput.value);
        
        if (bet <= 0 || bet > this.balance) {
            this.addLog('Geçersiz bahis miktarı!');
            return;
        }
        
        this.currentBet = bet;
        this.balance -= bet;
        this.updateBalance();
        
        this.seed = this.elements.seedInput.value.trim() || null;
        
        // Deste oluştur ve karıştır
        const baseDeck = this.createDeck();
        const randomFunc = this.seed ? 
            this.createSeededRandom(this.seed) : 
            () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
            
        this.deck = this.shuffleDeck(baseDeck, randomFunc);
        this.originalDeckOrder = [...this.deck];
        
        // Hash oluştur (commit)
        this.handHash = await this.createHash(this.originalDeckOrder);
        this.elements.handHash.value = this.handHash;
        
        // Elleri temizle
        this.hands = { player: [], bot2: [], bot3: [], dealer: [] };
        this.playerStates = { player: 'active', bot2: 'waiting', bot3: 'waiting', dealer: 'waiting' };
        this.currentPlayer = 'player';
        this.canDouble = true;
        
        // UI'ı temizle
        Object.values(this.cardContainers).forEach(container => {
            container.innerHTML = '';
        });
        
        // Oyuncu bölümlerini sıfırla
        document.querySelectorAll('.player-section').forEach(section => {
            section.classList.remove('active', 'winner', 'loser');
        });
        document.getElementById('player-section').classList.add('active');
        
        this.state = GameState.DEALING;
        this.addLog('Kartlar dağıtılıyor...');
        
        // Kartları dağıt (klasik blackjack usulü)
        setTimeout(() => this.dealInitialCards(), 500);
    }
    
    // İlk kartları dağıtma
    async dealInitialCards() {
        const dealOrder = ['player', 'bot2', 'bot3', 'dealer'];
        
        // İlk tur - herkese bir kart (krupiyenin ilk kartı kapalı)
        for (const player of dealOrder) {
            const card = this.deck.pop();
            this.hands[player].push(card);
            
            if (player === 'dealer') {
                this.addCardToUI(player, card, true); // Kapalı kart
            } else {
                this.addCardToUI(player, card, false);
            }
            this.updateTotal(player);
            await this.sleep(300);
        }
        
        // İkinci tur - herkese bir kart (hepsi açık)
        for (const player of dealOrder) {
            const card = this.deck.pop();
            this.hands[player].push(card);
            this.addCardToUI(player, card, false);
            this.updateTotal(player);
            await this.sleep(300);
        }
        
        this.addLog('Kartlar dağıtıldı. Oyuncu sırası.');
        
        // Blackjack kontrolü
        if (this.calculateHandValue(this.hands.player) === 21) {
            this.addLog('Blackjack! Otomatik stand.');
            setTimeout(() => this.stand(), 1000);
        } else {
            this.state = GameState.PLAYER_TURN;
            this.updateControls();
        }
    }
    
    // Kart ekleme (UI)
    addCardToUI(player, card, faceDown = false) {
        const container = this.cardContainers[player];
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        
        if (faceDown) {
            cardElement.classList.add('back');
            cardElement.textContent = '🂠';
            cardElement.dataset.facedown = 'true';
        } else {
            const isRed = ['H', 'D'].includes(card.suit);
            if (isRed) cardElement.classList.add('red');
            
            cardElement.innerHTML = `
                <div>${card.rank}</div>
                <div>${SUITS[card.suit]}</div>
            `;
        }
        
        container.appendChild(cardElement);
    }
    
    // El değeri hesaplama (As optimizasyonu ile)
    calculateHandValue(hand) {
        let value = 0;
        let aces = 0;
        
        for (const card of hand) {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += card.value;
            }
        }
        
        // As optimizasyonu: 21'i aştıkça As'ları 1 yap
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        
        return value;
    }
    
    // Toplam güncelleme
    updateTotal(player) {
        const total = this.calculateHandValue(this.hands[player]);
        this.totalDisplays[player].textContent = total;
        
        // 21'i aştıysa kırmızı yap
        if (total > 21) {
            this.totalDisplays[player].style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
        } else if (total === 21) {
            this.totalDisplays[player].style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
        } else {
            this.totalDisplays[player].style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
        }
    }
    
    // Kontrol butonları güncelleme
    updateControls() {
        const canHit = this.state === GameState.PLAYER_TURN && this.currentPlayer === 'player';
        const canDouble = canHit && this.canDouble && this.hands.player.length === 2 && this.balance >= this.currentBet;
        
        this.elements.hitBtn.disabled = !canHit;
        this.elements.standBtn.disabled = !canHit;
        this.elements.doubleBtn.disabled = !canDouble;
        this.elements.newHandBtn.disabled = this.state !== GameState.BETTING;
    }
    
    // Oyuncu aksiyonları
    hit() {
        if (this.state !== GameState.PLAYER_TURN || this.currentPlayer !== 'player') return;
        
        const card = this.deck.pop();
        this.hands.player.push(card);
        this.addCardToUI('player', card);
        this.updateTotal('player');
        this.canDouble = false; // Double artık mümkün değil
        
        const total = this.calculateHandValue(this.hands.player);
        
        if (total > 21) {
            this.addLog('Battın! (Bust)');
            this.stand(); // Otomatik stand
        } else if (total === 21) {
            this.addLog('21! Otomatik stand.');
            this.stand();
        } else {
            this.addLog(`Kart çektin. Toplam: ${total}`);
        }
        
        this.updateControls();
    }
    
    stand() {
        if (this.state !== GameState.PLAYER_TURN) return;
        
        this.addLog(`${this.currentPlayer === 'player' ? 'Sen' : this.currentPlayer} durdu.`);
        
        // Sonraki oyuncuya geç
        if (this.currentPlayer === 'player') {
            this.currentPlayer = 'bot2';
            this.state = GameState.BOTS_TURN;
            document.getElementById('player-section').classList.remove('active');
            document.getElementById('bot2-section').classList.add('active');
            setTimeout(() => this.playBot('bot2'), 1000);
        }
        
        this.updateControls();
    }
    
    double() {
        if (this.state !== GameState.PLAYER_TURN || this.currentPlayer !== 'player' || !this.canDouble) return;
        
        if (this.balance < this.currentBet) {
            this.addLog('Yetersiz bakiye!');
            return;
        }
        
        this.balance -= this.currentBet;
        this.currentBet *= 2;
        this.updateBalance();
        
        this.addLog('Bahsi ikiye katladın.');
        
        // Sadece bir kart çek ve otomatik stand
        const card = this.deck.pop();
        this.hands.player.push(card);
        this.addCardToUI('player', card);
        this.updateTotal('player');
        
        const total = this.calculateHandValue(this.hands.player);
        this.addLog(`Son kart: ${card.rank}${SUITS[card.suit]}. Toplam: ${total}`);
        
        // Otomatik stand
        setTimeout(() => this.stand(), 1500);
    }
    
    // Bot oyunu (temel strateji)
    async playBot(botName) {
        if (!this.hands[botName]) return;
        
        while (true) {
            const botTotal = this.calculateHandValue(this.hands[botName]);
            const dealerUpCard = this.hands.dealer[1]; // Krupiyenin açık kartı
            const dealerUpValue = dealerUpCard.rank === 'A' ? 11 : 
                                 ['J', 'Q', 'K'].includes(dealerUpCard.rank) ? 10 : 
                                 parseInt(dealerUpCard.rank) || 10;
            
            let shouldHit = false;
            
            // Basit bot stratejisi
            if (botTotal < 12) {
                shouldHit = true;
            } else if (botTotal >= 12 && botTotal <= 16) {
                shouldHit = dealerUpValue >= 7; // Krupiyenin güçlü kartı varsa hit
            } else {
                shouldHit = false; // 17+ ise dur
            }
            
            if (shouldHit && botTotal < 21) {
                const card = this.deck.pop();
                this.hands[botName].push(card);
                this.addCardToUI(botName, card);
                this.updateTotal(botName);
                
                const newTotal = this.calculateHandValue(this.hands[botName]);
                this.addLog(`${botName} kart çekti. Toplam: ${newTotal}`);
                
                if (newTotal > 21) {
                    this.addLog(`${botName} battı!`);
                    break;
                } else if (newTotal === 21) {
                    this.addLog(`${botName} 21 yaptı!`);
                    break;
                }
                
                await this.sleep(1500);
            } else {
                this.addLog(`${botName} durdu. Toplam: ${botTotal}`);
                break;
            }
        }
        
        // Sonraki bota geç
        if (botName === 'bot2') {
            document.getElementById('bot2-section').classList.remove('active');
            document.getElementById('bot3-section').classList.add('active');
            setTimeout(() => this.playBot('bot3'), 1000);
        } else if (botName === 'bot3') {
            document.getElementById('bot3-section').classList.remove('active');
            document.getElementById('dealer-section').classList.add('active');
            setTimeout(() => this.playDealer(), 1000);
        }
    }
    
    // Krupiye oyunu
    async playDealer() {
        this.state = GameState.DEALER_TURN;
        
        // İlk kapalı kartı aç
        const dealerContainer = this.cardContainers.dealer;
        const firstCard = dealerContainer.children[0];
        if (firstCard && firstCard.dataset.facedown === 'true') {
            const card = this.hands.dealer[0];
            const isRed = ['H', 'D'].includes(card.suit);
            
            firstCard.classList.remove('back');
            if (isRed) firstCard.classList.add('red');
            firstCard.innerHTML = `
                <div>${card.rank}</div>
                <div>${SUITS[card.suit]}</div>
            `;
            firstCard.removeAttribute('data-facedown');
        }
        
        this.updateTotal('dealer');
        this.addLog('Krupiye kartlarını açtı.');
        
        await this.sleep(2000);
        
        // Krupiye kuralları: < 17 ise hit, soft 17'de dur
        while (true) {
            const dealerTotal = this.calculateHandValue(this.hands.dealer);
            
            if (dealerTotal < 17) {
                const card = this.deck.pop();
                this.hands.dealer.push(card);
                this.addCardToUI('dealer', card);
                this.updateTotal('dealer');
                
                const newTotal = this.calculateHandValue(this.hands.dealer);
                this.addLog(`Krupiye kart çekti. Toplam: ${newTotal}`);
                
                if (newTotal > 21) {
                    this.addLog('Krupiye battı!');
                    break;
                }
                
                await this.sleep(2000);
            } else {
                this.addLog(`Krupiye durdu. Toplam: ${dealerTotal}`);
                break;
            }
        }
        
        // Sonuçları hesapla
        setTimeout(() => this.settleHand(), 2000);
    }
    
    // El sonuçlandırma
    settleHand() {
        this.state = GameState.SETTLE;
        
        const dealerTotal = this.calculateHandValue(this.hands.dealer);
        const playerTotal = this.calculateHandValue(this.hands.player);
        const bot2Total = this.calculateHandValue(this.hands.bot2);
        const bot3Total = this.calculateHandValue(this.hands.bot3);
        
        const dealerBust = dealerTotal > 21;
        const playerBust = playerTotal > 21;
        
        // Blackjack kontrolü (2 kartla 21)
        const playerBlackjack = playerTotal === 21 && this.hands.player.length === 2;
        const dealerBlackjack = dealerTotal === 21 && this.hands.dealer.length === 2;
        
        let playerWinnings = 0;
        let playerResult = '';
        
        // Oyuncu sonucu
        if (playerBust) {
            playerResult = 'Kaybettin (Bust)';
            document.getElementById('player-section').classList.add('loser');
        } else if (playerBlackjack && !dealerBlackjack) {
            playerWinnings = Math.floor(this.currentBet * 2.5); // 3:2 ödeme
            playerResult = 'Blackjack! Kazandın';
            document.getElementById('player-section').classList.add('winner');
        } else if (dealerBust || playerTotal > dealerTotal) {
            playerWinnings = this.currentBet * 2; // 1:1 ödeme
            playerResult = 'Kazandın!';
            document.getElementById('player-section').classList.add('winner');
        } else if (playerTotal === dealerTotal) {
            playerWinnings = this.currentBet; // Push - bahis geri
            playerResult = 'Berabere (Push)';
        } else {
            playerResult = 'Kaybettin';
            document.getElementById('player-section').classList.add('loser');
        }
        
        this.balance += playerWinnings;
        this.updateBalance();
        
        // Sonuçları logla
        this.addLog(`--- SONUÇLAR ---`);
        this.addLog(`Sen: ${playerTotal} - ${playerResult}`);
        this.addLog(`Bot2: ${bot2Total} - ${this.getBotResult(bot2Total, dealerTotal, dealerBust)}`);
        this.addLog(`Bot3: ${bot3Total} - ${this.getBotResult(bot3Total, dealerTotal, dealerBust)}`);
        this.addLog(`Krupiye: ${dealerTotal}`);
        
        // Yeni el için hazırla
        setTimeout(() => {
            this.state = GameState.REVEAL;
            this.showRevealModal();
        }, 3000);
    }
    
    // Bot sonucu hesaplama
    getBotResult(botTotal, dealerTotal, dealerBust) {
        if (botTotal > 21) return 'Kaybetti (Bust)';
        if (dealerBust || botTotal > dealerTotal) return 'Kazandı';
        if (botTotal === dealerTotal) return 'Berabere';
        return 'Kaybetti';
    }
    
    // Doğrulama modalını göster
    showRevealModal() {
        const deckString = this.originalDeckOrder.map(card => 
            `${card.rank}${card.suit}`
        ).join(' ');
        
        this.elements.deckOrder.value = deckString;
        this.elements.revealModal.style.display = 'block';
        this.elements.verificationResult.innerHTML = '';
    }
    
    // Deste doğrulama
    async verifyDeck() {
        const currentHash = await this.createHash(this.originalDeckOrder);
        const originalHash = this.handHash;
        
        const resultDiv = this.elements.verificationResult;
        
        if (currentHash === originalHash) {
            resultDiv.className = 'verification-success';
            resultDiv.innerHTML = '✅ Doğrulandı! Deste sıralaması orijinal hash ile eşleşiyor.';
        } else {
            resultDiv.className = 'verification-failed';
            resultDiv.innerHTML = '❌ Doğrulama başarısız! Hash uyuşmuyor.';
        }
    }
    
    // Modal kapatma
    closeModal() {
        this.elements.revealModal.style.display = 'none';
        this.state = GameState.BETTING;
        this.updateControls();
        
        // Tüm bölümleri sıfırla
        document.querySelectorAll('.player-section').forEach(section => {
            section.classList.remove('active', 'winner', 'loser');
        });
        document.getElementById('player-section').classList.add('active');
    }
    
    // Hash kopyalama
    copyHash() {
        navigator.clipboard.writeText(this.elements.handHash.value).then(() => {
            this.addLog('Hash kopyalandı!');
        });
    }
    
    // Bakiye güncelleme
    updateBalance() {
        this.elements.balanceDisplay.textContent = this.balance;
        localStorage.setItem('blackjack-balance', this.balance.toString());
    }
    
    // Log ekleme
    addLog(message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        
        this.elements.gameLog.appendChild(logEntry);
        this.elements.gameLog.scrollTop = this.elements.gameLog.scrollHeight;
    }
    
    // Yardımcı fonksiyon - bekleme
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Oyunu başlat
document.addEventListener('DOMContentLoaded', () => {
    new BlackjackGame();
});