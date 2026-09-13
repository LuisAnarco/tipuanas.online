/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 06_push_notification_service.js
 * DESCRIÇÃO: Serviço de Notificações Push & Alertas Sonoros para Lojistas
 * ==============================================================================
 */

export class MerchantNotificationService {
    constructor() {
        this.hasPermission = false;
        this.init();
    }

    /**
     * Solicita permissão para enviar notificações do navegador
     */
    async init() {
        if (!('Notification' in window)) {
            console.warn('Este navegador não suporta notificações de trabalho.');
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
        // Toca alerta sonoro
        this.playNotificationSound();

        // Dispara notificação nativa se permitido
        if (this.hasPermission) {
            const title = `🚨 Novo Pedido #${order.id.slice(0, 6)}!`;
            const options = {
                body: `Cliente: ${order.client_name}\nTotal: R$ ${Number(order.total).toFixed(2)}\nEndereço: ${order.client_address}`,
                icon: '/favicon.ico',
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
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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