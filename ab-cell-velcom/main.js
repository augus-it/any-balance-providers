﻿/**
Провайдер AnyBalance (http://any-balance-providers.googlecode.com)

Текущий баланс у белорусского сотового оператора Velcom.

Сайт оператора: http://velcom.by/
Личный кабинет: https://internet.velcom.by/
*/

function getParam (html, result, param, regexp, replaces, parser) {
	if (param && (param != '__tariff' && !AnyBalance.isAvailable (param)))
		return;

	var value = regexp.exec (html);
	if (value) {
		value = value[1];
		if (replaces) {
			for (var i = 0; i < replaces.length; i += 2) {
				value = value.replace (replaces[i], replaces[i+1]);
			}
		}
		if (parser)
			value = parser (value);

    if(param)
      result[param] = value;
    else
      return value
	}
}

var replaceTagsAndSpaces = [/<[^>]*>/g, ' ', /\s{2,}/g, ' ', /^\s+|\s+$/g, '', /^"+|"+$/g, ''];
var replaceFloat = [/\s+/g, '', /,/g, '.'];

function requestPostMultipart(url, data, headers){
	var parts = [];
	var boundary = '------WebKitFormBoundaryrceZMlz5Js39A2A6';
	for(var name in data){
		parts.push(boundary, 
		'Content-Disposition: form-data; name="' + name + '"',
		'',
		data[name]);
	}
	parts.push(boundary);
	headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary.substr(2);
	return AnyBalance.requestPost(url, parts.join('\r\n'), headers);
}

function main(){
    var prefs = AnyBalance.getPreferences();

    var baseurl = "https://internet.velcom.by/";
    AnyBalance.setDefaultCharset('windows-1251');

    var matches;
    if(!(matches = /^\+375(\d\d)(\d{7})$/.exec(prefs.login)))
	throw new AnyBalance.Error('Неверный номер телефона. Необходимо ввести номер в международном формате без пробелов и разделителей!');

    var phone = matches[2];
    var prefix = matches[1];
    
    var html = AnyBalance.requestGet(baseurl + 'work.html');
    var sid = getParam(html, null, null, /name="sid3" value="([^"]*)"/i);
    if(!sid)
	throw new AnyBalance.Error('Не удалось найти идентификатор сессии!');
    
    var form = getParam(html, null, null, /(<form[^>]*name="mainForm"[^>]*>[\s\S]*?<\/form>)/i);
    if(!form)
	throw new AnyBalance.Error('Не удалось найти форму входа, похоже, velcom её спрятал. Обратитесь к автору провайдера.');

    //Чё, влад, всё-таки заглянул, да? :)
    $form = $(form);
    var params = {};
    $form.find('input, select').each(function(index){
	var $inp = $(this);
	var id=$inp.attr('id');
	var value = $inp.attr('value');
	if(id){
		if(/PRE/i.test(id)){ //Это префикс
			value = prefix;
		}else if(/NUMBER/i.test(id)){ //Это номер
			value = phone;
		}else if(/PWD/i.test(id)){ //Это пароль
			value = prefs.password;
		}
	}
	var name = $inp.attr('name');
	if(!name)
		return;
	if(name == 'sid3')
		sid = value;
	if(name == 'user_input_0')
		value = '_next';
	if(name == 'user_input_timestamp')
		value = new Date().getTime();
	params[name] = value || '';
    });

    var required_headers = {
	'Origin': 'https://internet.velcom.by',
	'Referer': 'https://internet.velcom.by/work.html',
	'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.162 Safari/535.19'
    };
    
    var html = requestPostMultipart(baseurl + 'work.html', params, required_headers);

    var error = getParam(html, null, null, /<td[^>]+class="INFO(?:_Error)?"[^>]*>(.*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    if(error)
        throw new AnyBalance.Error(error);

    var result = {success: true};

    var html = requestPostMultipart(baseurl + 'work.html', {
        sid3: sid,
        user_input_timestamp: new Date().getTime(),
        user_input_0: '_root/USER_INFO',
        last_id: ''
    }, required_headers);
         
    getParam(html, result, 'userName', /ФИО:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'userNum', /(?:номер клиента|Номер телефона):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'balance', /(?:Текущий баланс|Баланс):[\s\S]*?<td[^>]*>(-?\d[\s\d,\.]*)/i, replaceFloat, parseFloat);
    getParam(html, result, 'status', /(?:Текущий статус абонента|Статус абонента):[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, '__tariff', /Тарифный план:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i, replaceTagsAndSpaces, html_entity_decode);
    getParam(html, result, 'min', /Остаток минут, SMS, MMS, GPRS, включенных в абонплату:[\s\S]*?<td[^>]*>[\s\S]*?(-?\d[\s\d,\.]*) мин(?:,|\s*<)/i, replaceFloat, parseFloat);
    getParam(html, result, 'min_fn', /Остаток минут, SMS, MMS, GPRS, включенных в абонплату:[\s\S]*?<td[^>]*>[\s\S]*?(-?\d[\s\d,\.]*) мин на ЛН/i, replaceFloat, parseFloat);
    getParam(html, result, 'min_velcom', /Остаток минут, SMS, MMS, GPRS, включенных в абонплату:[\s\S]*?<td[^>]*>[\s\S]*?(-?\d[\s\d,\.]*) мин на velcom/i, replaceFloat, parseFloat);

    var traffic = getParam(html, null, null, /Остаток минут, SMS, MMS, GPRS, включенных в абонплату:[\s\S]*?<td[^>]*>[\s\S]*?(-?\d[\s\d,\.]*) Мб/i, replaceFloat, parseFloat) || 0;

    if(AnyBalance.isAvailable('traffic')){
        html = requestPostMultipart(baseurl + 'work.html', {
            sid3: sid,
            user_input_timestamp: new Date().getTime(),
            user_input_0: '_root/TPLAN/PACKETS',
            last_id: '',
            user_input_1: -1
        }, required_headers);

        var packetMb = getParam(html, null, null, /Остаток интернет-трафика:[^<]*?(\d+)\s*Мб/i, replaceFloat, parseFloat) || 0;
        var packetKb = getParam(html, null, null, /Остаток интернет-трафика:[^<]*?(\d+)\s*Кб/i, replaceFloat, parseFloat) || 0;

        result.traffic = traffic + packetMb + packetKb/1000;
    }
    
    AnyBalance.setResult(result);
}

function html_entity_decode(str)
{
    //jd-tech.net
    var tarea=document.createElement('textarea');
    tarea.innerHTML = str;
    return tarea.value;
}

