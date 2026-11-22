'use strict';
// Menu terms checked against PlayStation regional support pages, 2026-11-23.
// See README.md for sources and the firmware-dependent storage menu wording.
// The final Start Transfer button has not been verified on each system language:
// keep its English label and add a local explanation as requested.
(() => {
  const menus = {
    en:['Settings → System → System Software → Data Transfer','Settings → Saved Data and Game/App Settings → Saved Data (PS5) → Console Storage → Delete','Select','Start Transfer'],
    zh:['设定 → 系统 → 系统软件 → 数据传输','设定 → 已保存的数据和游戏/应用程序设定 → 已保存的数据 (PS5) → 主机存储 → 删除','选择','Start Transfer（开始传输）'],
    'zh-TW':['設定 → 系統 → 系統軟體 → 資料傳送','設定 → 保存資料和遊戲/應用程式設定 → 保存資料 (PS5) → 主機儲存空間 → 刪除','選擇','Start Transfer（開始傳送）'],
    ja:['設定 → システム → システムソフトウェア → データ転送','設定 → セーブデータとゲーム／アプリ設定 → セーブデータ（PS5）→ 本体ストレージ → 削除','選択','Start Transfer（転送を開始）'],
    ko:['설정 → 시스템 → 시스템 소프트웨어 → 데이터 전송','설정 → 저장 데이터 및 게임/앱 설정 → 저장 데이터(PS5) → 콘솔 스토리지 → 삭제','선택','Start Transfer (전송 시작)'],
    es:['Ajustes → Sistema → Software del sistema → Transferencia de datos','Ajustes → Ajustes de juegos/aplicaciones y datos guardados → Datos guardados (PS5) → Almacenamiento de la consola → Eliminar','Seleccionar','Start Transfer (iniciar transferencia)'],
    'pt-BR':['Configurações → Sistema → Software do sistema → Transferência de dados','Configurações → Dados salvos e configurações de jogos/aplicativos → Dados salvos (PS5) → Armazenamento do console → Excluir','Selecionar','Start Transfer (iniciar transferência)'],
    de:['Einstellungen → System → Systemsoftware → Datenübertragung','Einstellungen → Gespeicherte Daten und Spiele-/App-Einstellungen → Gespeicherte Daten (PS5) → Konsolenspeicher → Löschen','Auswählen','Start Transfer (Übertragung starten)'],
    fr:['Paramètres → Système → Logiciel système → Transfert de données','Paramètres → Données sauvegardées et paramètres des jeux/applications → Données sauvegardées (PS5) → Stockage sur console → Supprimer','Choisir','Start Transfer (lancer le transfert)'],
    ru:['Настройки → Система → Системное программное обеспечение → Перенос данных','Настройки → Сохраненные данные и настройки игр/приложений → Сохраненные данные (PS5) → Память консоли → Удалить','Выбрать','Start Transfer (начать перенос)']
  };
  for (const [lang,[transfer,remove,select,start]] of Object.entries(menus)) {
    Object.assign(window.UI_COPY[lang],{
      pairPath:`${transfer} → ${select}: GarlicTransfer Pairing`,
      deletePath:remove,
      transferPath:`${transfer} → ${select}: GTA6 Save Editor → ${start}`
    });
  }
})();
