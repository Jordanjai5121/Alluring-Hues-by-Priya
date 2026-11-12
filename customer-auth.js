/* Customer accounts and private order dashboard. Supabase Auth + RLS. */
(function(){
 'use strict';
 var cfg=window.AHP_SUPABASE_CONFIG||{};
 var client=window.AHP_SUPABASE||null;
 var mode='signin',currentUser=null;
 var $id=function(id){return document.getElementById(id);};
 var say=function(message,isError){var el=$id('customerAuthMessage');if(el){el.textContent=message||'';el.style.color=isError?'#b3261e':'var(--mute)';}};
 var escapeText=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});};
 function setMode(value){
   mode=value;
   $id('customerAuthTitle').textContent=value==='signup'?'Create your customer account':'Sign in to your account';
   $id('customerNameWrap').hidden=value!=='signup';
   $id('customerPhoneWrap').hidden=value!=='signup';
   $id('customerPassword').autocomplete=value==='signup'?'new-password':'current-password';
   $id('customerAuthSubmit').textContent=value==='signup'?'Create account':'Sign in';
   $id('customerModeToggle').textContent=value==='signup'?'I already have an account':'Create account';
   $id('customerForgot').hidden=value==='signup';
   say('');
 }
 function showSignedIn(user){
   currentUser=user;
   $id('customerAuthForm').hidden=true;
   $id('customerAccountPanel').hidden=false;
   $id('customerGreeting').textContent='Signed in as '+(user.email||'customer');
   say('Your account is active.');
   loadCustomerOrders();
 }
 function showSignedOut(){
   currentUser=null;
   $id('customerAuthForm').hidden=false;
   $id('customerAccountPanel').hidden=true;
   setMode('signin');
   $id('customerPassword').value='';
 }
 async function loadCustomerOrders(){
   var target=$id('customerOrders');
   if(!client||!currentUser){target.innerHTML='<p class="auth-note">Sign in to see your orders.</p>';return;}
   target.innerHTML='<p class="auth-note">Loading your orders…</p>';
   var result=await client.from('orders')
     .select('id,order_number,customer_name,created_at,status,payment_status,payment_reference,payment_method,order_items(product_name,quantity)')
     .eq('customer_id',currentUser.id)
     .order('created_at',{ascending:false});
   if(result.error){
     console.error('Customer order list failed:',result.error);
     target.innerHTML='<p class="auth-note">Order history is not ready yet. Run the customer account SQL setup in Supabase, then refresh.</p>';
     return;
   }
   var rows=result.data||[];
   if(!rows.length){target.innerHTML='<p class="auth-note">No orders found for this account yet. Place an order while signed in.</p>';return;}
   target.innerHTML=rows.map(function(order){
     var items=Array.isArray(order.order_items)?order.order_items:[];
     var status=order.status||'Placed';
     var payment=order.payment_status||'Not recorded';
     return '<article class="auth-order"><h3>'+escapeText(order.order_number||order.id)+'</h3>'+
       '<p class="auth-note">'+escapeText(new Date(order.created_at).toLocaleString())+'</p>'+
       '<p>'+items.map(function(item){return escapeText(item.product_name)+' × '+Number(item.quantity||0);}).join('<br>')+'</p>'+
       '<p><strong>Order status:</strong> '+escapeText(status)+'</p>'+
       '<p><strong>Payment status:</strong> '+escapeText(payment)+'</p>'+
       (order.payment_reference?'<p><strong>Payment reference:</strong> '+escapeText(order.payment_reference)+'</p>':'')+
       (order.payment_method?'<p><strong>Payment method:</strong> '+escapeText(order.payment_method)+'</p>':'')+
       '</article>';
   }).join('');
 }
 async function init(){
   if(!window.supabase||!cfg.url||!cfg.anonKey){say('Customer account service is not configured. Please contact the store.',true);return;}
   client=window.AHP_SUPABASE||window.supabase.createClient(cfg.url,cfg.anonKey);
   window.AHP_CUSTOMER_AUTH=client;
   var session=await client.auth.getSession();
   if(session.error){say(session.error.message,true);return;}
   if(session.data.session)showSignedIn(session.data.session.user);
   else showSignedOut();
   client.auth.onAuthStateChange(function(event,sessionValue){
     if(sessionValue&&sessionValue.user)showSignedIn(sessionValue.user);
     else if(event==='SIGNED_OUT')showSignedOut();
   });
 }
 $id('customerModeToggle').addEventListener('click',function(){setMode(mode==='signin'?'signup':'signin');});
 $id('customerAuthSubmit').addEventListener('click',async function(){
   if(!client){say('Account service is unavailable.',true);return;}
   var button=this;button.disabled=true;
   try{
     var email=$id('customerEmail').value.trim();
     var password=$id('customerPassword').value;
     if(!email||!password)throw new Error('Enter your email address and password.');
     if(password.length<8)throw new Error('Password must contain at least 8 characters.');
     var result;
     if(mode==='signup'){
       var fullName=$id('customerName').value.trim();
       var phone=$id('customerPhone').value.trim();
       if(fullName.length<2)throw new Error('Enter your full name.');
       result=await client.auth.signUp({email:email,password:password,options:{data:{full_name:fullName,phone:phone}}});
       if(result.error)throw result.error;
       if(result.data.session)showSignedIn(result.data.user);
       else say('Account created. Please verify your email using the message sent by Supabase, then sign in.');
     }else{
       result=await client.auth.signInWithPassword({email:email,password:password});
       if(result.error)throw result.error;
       showSignedIn(result.data.user);
     }
   }catch(error){say(error.message||'Could not complete account request.',true);}
   finally{button.disabled=false;}
 });
 $id('customerForgot').addEventListener('click',async function(){
   if(!client)return;
   var email=$id('customerEmail').value.trim();
   if(!email){say('Enter your email address first.',true);return;}
   var result=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/#customerAuth'});
   say(result.error?result.error.message:'Password reset instructions have been sent if this email is registered.',!!result.error);
 });
 $id('customerSignOut').addEventListener('click',async function(){
   if(!client)return;
   var result=await client.auth.signOut();
   if(result.error)say(result.error.message,true);else showSignedOut();
 });
 $id('customerRefreshOrders').addEventListener('click',loadCustomerOrders);
 window.addEventListener('ahp-order-placed',function(){if(currentUser)loadCustomerOrders();});
 init().catch(function(error){console.error(error);say('Could not initialise customer account.',true);});
})();
