/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: 06_push_notification_service.js
 * DESCRIÇÃO: Alertas sonoros e notificações do navegador para novos pedidos.
 *            Carregado como script comum no painel do lojista (04_merchant_portal.html).
 *            O navegador só libera som/permissão depois de um clique do usuário,
 *            por isso o painel chama enable() a partir do botão "Ativar alertas".
 * ==============================================================================
 */

class MerchantNotificationService {
    constructor() {
        this.enabled = false;
        this.hasPermission = 'Notification' in window && Notification.permission === 'granted';
        this.audioCtx = null;
    }

    /**
     * Liga os alertas (precisa ser chamado a partir de um clique): destrava o áudio
     * e pede permissão de notificação do navegador.
     */
    async enable() {
        this.enabled = true;
        try {
            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
        } catch (e) {
            console.warn('Áudio indisponível neste navegador:', e);
        }

        if (!('Notification' in window)) {
            console.warn('Este navegador não suporta notificações.');
            return;
        }

        if (Notification.permission === 'granted') {
            this.hasPermission = true;
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.hasPermission = permission === 'granted';
        }
    }

    /**
     * Dispara um alerta sonoro e visual para novos pedidos
     */
    notifyNewOrder(order) {
        if (!this.enabled) return;

        // Toca alerta sonoro
        this.playNotificationSound();

        // Dispara notificação nativa se permitido
        if (this.hasPermission) {
            const title = `🚨 Novo Pedido #${order.id.slice(0, 6)}!`;
            const addr = order.delivery_address || {};
            const options = {
                body: `Cliente: ${addr.client_name || 'Cliente'}\nTotal: R$ ${Number(order.total_amount).toFixed(2)}\nEndereço: ${order.is_takeout ? 'Retirada no local' : (addr.address || 'não informado')}`,
                icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
                tag: order.id,
                requireInteraction: true
            };

            new Notification(title, options);
        }
    }

    /**
     * Toca um sinal sonoro simples via Web Audio API (sem dependência de arquivos externos)
     */
    playNotificationSound() {
        try {
            const audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            this.audioCtx = audioCtx;
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5

            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.4);
        } catch (e) {
            console.error('Erro ao reproduzir áudio de notificação:', e);
        }
    }
}
