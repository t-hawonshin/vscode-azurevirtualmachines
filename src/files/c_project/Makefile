cello:
	gcc -g -o main main.c

clean:
	rm main

install:
	mkdir -p $(DESTDIR)/usr/bin
	install -m 0755 main $(DESTDIR)/usr/bin/main
