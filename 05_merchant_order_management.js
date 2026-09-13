/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 05_merchant_order_management.js
 * DESCRIÇÃO: Lógica de Gestão de Pedidos em Tempo Real via Supabase
 * ==============================================================================
 */

// Configuração Oficial do Supabase
const SUPABASE_URL = 'https://uiroqxinszrhvyzuiqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcm9xeGluc3pyaHZ5enVpcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzEyNDYsImV4cCI6MjEwNDMwNzI0Nn0.suJIxTU26t8U7S6IRiNChZtfLyQzftOVF0sZe1c7x2k';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    initMerchantPanel();
});

/**
 * Inicializa a escuta dos pedidos e contadores
 */
async function initMerchantPanel() {
    fetchOrders();
    subscribeToNewOrders();
}

/**
 * Busca pedidos existentes no Supabase
 */
async function fetchOrders() {
    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar pedidos:', error);
        return;
    }

    renderOrders(orders);
    updateMetrics(orders);
}

/**
 * Renderiza a lista de pedidos no HTML
 */
function renderOrders(orders) {
    const listContainer = document.getElementById('orders-list');
    if (!orders || orders.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">Aguardando novos pedidos...</p>`;
        return;
    }

    listContainer.innerHTML = orders.map(order => `
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-900">#${order.id.slice(0, 8)}</span>
                    <span class="text-xs text-gray-500">• ${order.client_name}</span>
                    <span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${order.status}</span>
                </div>
                <p class="text-xs text-gray-600 mt-1">📍 ${order.client_address}</p>
                <p class="text-xs text-gray-500 mt-0.5">💳 ${order.payment_method} | PIN: <strong class="text-emerald-600">${order.delivery_pin}</strong></p>
            </div>
            <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                <span class="font-bold text-gray-900 text-sm">R$ ${Number(order.total).toFixed(2)}</span>
                <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs border border-gray-300 rounded p-1.5 bg-white">
                    <option value="PENDING" ${order.status === 'PENDING' ? 'selected' : ''}>Pendente</option>
                    <option value="ACCEPTED" ${order.status === 'ACCEPTED' ? 'selected' : ''}>Aceito</option>
                    <option value="PREPARING" ${order.status === 'PREPARING' ? 'selected' : ''}>Em Preparação</option>
                    <option value="IN_TRANSIT" ${order.status === 'IN_TRANSIT' ? 'selected' : ''}>A Caminho</option>
                    <option value="COMPLETED" ${order.status === 'COMPLETED' ? 'selected' : ''}>Concluído</option>
                </select>
            </div>
        </div>
    `).join('');
}

/**
 * Atualiza o status de um pedido no banco de dados
 */
async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        alert('Erro ao atualizar status do pedido');
    } else {
        fetchOrders();
    }
}

/**
 * Atualiza os indicadores do topo do painel
 */
function updateMetrics(orders) {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((acc, order) => acc + Number(order.total), 0);
    const pendingCount = orders.filter(o => o.status === 'PENDING').length;

    document.getElementById('total-orders-today').textContent = totalOrders;
    document.getElementById('total-revenue-today').textContent = `R$ ${totalRevenue.toFixed(2)}`;
    document.getElementById('pending-badge').textContent = `${pendingCount} Pendentes`;
}

/**
 * Escuta novos pedidos inseridos em tempo real via Supabase Realtime
 */
function subscribeToNewOrders() {
    supabase
        .channel('public:orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            fetchOrders();
        })
        .subscribe();
}